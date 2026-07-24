// ════════════════════════════════════════════════════════════════
//  Worker de classificação de leads
//  Fluxo:
//   1. Assina canal Redis crm:new-message (publicado pelo wa-daemon)
//   2. Para cada mensagem: carrega contexto da conversa do Postgres
//   3. Resolve o provedor de IA (null = desativado, só salva)
//   4. Se ativo: classifica + gera resposta humanizada
//   5. Persiste LeadClassification + atualiza Lead (estágio inferido)
//   6. Publica a resposta no canal crm:new-reply (wa-daemon envia no WA)
// ════════════════════════════════════════════════════════════════
import { Redis } from "ioredis";
import { prisma } from "@crm/db";
import {
  REDIS_CHANNELS,
  type NewMessageEvent,
  type NewReplyEvent,
} from "@crm/shared-types";

import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { getProvider } from "./providers/factory.js";
import type { ClassifyContext, ConversationTurn } from "./providers/types.js";

/**
 * Inicia o consumidor de novas mensagens.
 * Retorna o subscriber Redis (para graceful shutdown).
 */
export function startClassificationWorker(): Redis {
  const subscriber = new Redis(env.redisUrl, { maxRetriesPerRequest: null });

  subscriber.on("error", (err) => logger.error({ err }, "[worker] erro no subscriber"));

  subscriber.subscribe(REDIS_CHANNELS.NEW_MESSAGE, (err) => {
    if (err) {
      logger.error({ err }, "[worker] falha ao assinar new-message");
    } else {
      logger.info("[worker] assinando canal new-message");
    }
  });

  subscriber.on("message", (_channel, raw) => {
    // Processa sem bloquear o subscriber (não usa await no handler de evento).
    const event = safeParse<NewMessageEvent>(raw);
    if (event) {
      void handleNewMessage(event).catch((err) =>
        logger.error({ err, messageId: event.messageId }, "[worker] erro ao processar"),
      );
    }
  });

  return subscriber;
}

/** Processa uma nova mensagem: classifica e (se IA ativa) responde. */
async function handleNewMessage(event: NewMessageEvent): Promise<void> {
  logger.info({ messageId: event.messageId, contactId: event.contactId }, "[worker] processando");

  const ctx = await buildContext(event);
  if (!ctx) {
    logger.warn({ messageId: event.messageId }, "[worker] contexto não encontrado, pulando");
    return;
  }

  // Resolve o provedor (null = desativado).
  const provider = await getProvider();
  if (!provider) {
    logger.info({ messageId: event.messageId }, "[worker] IA desativada — mensagem apenas salva");
    return;
  }

  // Garante que o lead existe (estágio NOVOS por padrão).
  await ensureLead(event.contactId);

  // Classifica + gera resposta.
  let result;
  try {
    result = await provider.classifyAndReply(ctx);
  } catch (err) {
    logger.error({ err, messageId: event.messageId }, `[${provider.name}] falha ao classificar`);
    return;
  }

  logger.info(
    { temperature: result.temperature, interest: result.interestCategory, provider: provider.name },
    `[worker] classificado`,
  );

  // Persiste classificação + atualiza estágio do lead.
  await persistClassification(event.contactId, result);
  await updateLeadStage(event.contactId, result.temperature);

  // Publica a resposta para o wa-daemon enviar (com humanização de timing).
  const reply: NewReplyEvent = {
    contactId: event.contactId,
    jid: await getJid(event.contactId),
    body: result.reply,
    source: "ai",
  };
  await publishReply(reply);
  logger.info({ contactId: event.contactId }, "[worker] resposta publicada para envio");
}

// ── Helpers de persistência ───────────────────────────────────────

/** Constrói o contexto a partir do histórico da conversa. */
async function buildContext(event: NewMessageEvent): Promise<ClassifyContext | null> {
  const contact = await prisma.contact.findUnique({ where: { id: event.contactId } });
  if (!contact) return null;

  const conversation = await prisma.conversation.findFirst({
    where: { contactId: event.contactId, status: "active" },
    orderBy: { createdAt: "desc" },
    include: {
      messages: {
        orderBy: { timestamp: "asc" },
        take: env.historyLimit,
      },
    },
  });

  const history: ConversationTurn[] = (conversation?.messages ?? []).map((m) => ({
    role: m.direction === "INBOUND" ? "inbound" : "outbound",
    text: m.body,
  }));

  return {
    contactName: contact.name ?? undefined,
    contactPhone: contact.phone,
    newMessage: event.body,
    history,
  };
}

/** Garante que existe um Lead para o contato (cria se necessário). */
async function ensureLead(contactId: string): Promise<void> {
  await prisma.lead.upsert({
    where: { contactId },
    create: { contactId, funnelStage: "NOVOS" },
    update: {},
  });
}

/** Grava a classificação do lead. */
async function persistClassification(
  contactId: string,
  result: { temperature: "QUENTE" | "MEDIO" | "FRIO"; interestCategory: string; summary: string; confidence: number; nextAction: string | null },
): Promise<void> {
  const lead = await prisma.lead.findUnique({ where: { contactId } });
  if (!lead) return;

  await prisma.leadClassification.create({
    data: {
      leadId: lead.id,
      temperature: result.temperature,
      interestCategory: result.interestCategory,
      summary: result.summary,
      confidence: result.confidence,
      nextAction: result.nextAction,
    },
  });
}

/**
 * Infere/atualiza o estágio do funil com base na temperatura.
 * Regras simples: QUENTE → QUALIFICADOS; MEDIO → EM_CONVERSA; FRIO mantém.
 */
async function updateLeadStage(
  contactId: string,
  temperature: "QUENTE" | "MEDIO" | "FRIO",
): Promise<void> {
  const stage =
    temperature === "QUENTE" ? "QUALIFICADOS" : temperature === "MEDIO" ? "EM_CONVERSA" : null;
  if (!stage) return;

  const lead = await prisma.lead.findUnique({ where: { contactId } });
  if (!lead) return;
  // Não regride: se já está em QUALIFICADOS, não volta.
  if (lead.funnelStage === "QUALIFICADOS" && stage === "EM_CONVERSA") return;

  if (lead.funnelStage !== stage) {
    await prisma.lead.update({ where: { id: lead.id }, data: { funnelStage: stage } });
    logger.info({ contactId, stage }, "[worker] estágio do lead atualizado");
  }
}

/** Pega o JID do contato para onde enviar a resposta. */
async function getJid(contactId: string): Promise<string> {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  return contact?.jid ?? `${contact?.phone}@s.whatsapp.net`;
}

// ── Helpers de infra ──────────────────────────────────────────────

let publisherClient: Redis | null = null;
function getPublisher(): Redis {
  if (!publisherClient) {
    publisherClient = new Redis(env.redisUrl, { maxRetriesPerRequest: null });
    publisherClient.on("error", (err) => logger.error({ err }, "[worker] erro no publisher"));
  }
  return publisherClient;
}

async function publishReply(event: NewReplyEvent): Promise<void> {
  await getPublisher().publish(REDIS_CHANNELS.NEW_REPLY, JSON.stringify(event));
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
