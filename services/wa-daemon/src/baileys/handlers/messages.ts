// ════════════════════════════════════════════════════════════════
//  Handler de mensagens recebidas
//  - Filtra só chats 1:1 (ignora grupos, broadcast, newsletter)
//  - GUARDA ANTI-AUTORESPOSTA: ignora mensagens próprias (key.fromMe)
//  - Persiste Contact/Conversation/Message no Postgres
//  - Publica NewMessageEvent no Redis → dispara classificação (Etapa 2)
// ════════════════════════════════════════════════════════════════
import type { proto, WASocket } from "../baileys-import.js";
import { prisma } from "@crm/db";

import { logger } from "../../lib/logger.js";
import { publishNewMessage } from "../../lib/publisher.js";
import { waState } from "../state.js";

type WAMessage = proto.IWebMessageInfo;

/**
 * Extrai texto de uma mensagem Baileys (suporta os dois formatos comuns).
 * Retorna null para mídia/sticker/áudio/etc.
 */
function extractText(msg: WAMessage): string | null {
  const m = msg.message;
  if (!m) return null;
  return m.conversation ?? m.extendedTextMessage?.text ?? null;
}

/**
 * Extrai o número de telefone a partir de um JID individual.
 * "5511999999999@s.whatsapp.net" → "5511999999999"
 */
function phoneFromJid(jid: string): string {
  return jid.split("@")[0]?.split(":")[0] ?? "";
}

/** É um chat 1:1 (não grupo, broadcast, newsletter)? */
function isIndividualChat(jid: string): boolean {
  return jid.endsWith("@s.whatsapp.net");
}

/**
 * Processa uma mensagem recebida do WhatsApp.
 * Chamado pelo handler messages.upsert (type "notify").
 */
export async function handleIncomingMessage(msg: WAMessage): Promise<void> {
  const key = msg.key;
  const jid = key?.remoteJid;

  // ── Filtros de descarte ────────────────────────────────────────
  if (!jid) return;
  if (!isIndividualChat(jid)) return; // ignora grupos/broadcast/newsletter

  // GUARDA ANTI-AUTORESPOSTA: mensagens que EU envio chegam de volta com fromMe=true.
  if (key.fromMe) return;

  const text = extractText(msg);
  if (!text) return; // ignora mídia/áudio/sticker — só processamos texto

  const phone = phoneFromJid(jid);
  const pushName = msg.pushName ?? undefined;
  const ts = msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : new Date();

  logger.info({ phone, text: text.slice(0, 40), pushName }, "[msg] recebida");

  // ── Upsert Contact + Conversation + Message (transação) ────────
  const result = await prisma.$transaction(async (tx) => {
    const contact = await tx.contact.upsert({
      where: { phone },
      create: { phone, name: pushName, jid },
      update: { jid, ...(pushName ? { name: pushName } : {}) },
    });

    // Uma conversa ativa por contato.
    let conversation = await tx.conversation.findFirst({
      where: { contactId: contact.id, status: "active" },
      orderBy: { createdAt: "desc" },
    });
    if (!conversation) {
      conversation = await tx.conversation.create({
        data: { contactId: contact.id, status: "active", lastMessageAt: ts },
      });
    } else {
      conversation = await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: ts },
      });
    }

    // Idempotência: se waMessageId já existe, não reprocessa (evita dupla resposta).
    const existing = key.id
      ? await tx.message.findUnique({ where: { waMessageId: key.id } })
      : null;
    if (existing) {
      logger.debug({ waMessageId: key.id }, "[msg] já processada, ignorando");
      return null;
    }

    const message = await tx.message.create({
      data: {
        conversationId: conversation.id,
        direction: "INBOUND",
        body: text,
        waMessageId: key.id ?? undefined,
        aiGenerated: false,
        timestamp: ts,
      },
    });

    return { contact, conversation, message };
  });

  if (!result) return; // mensagem duplicada

  // ── Publica evento → worker de IA (Etapa 2) vai classificar ─────
  await publishNewMessage({
    messageId: result.message.id,
    conversationId: result.conversation.id,
    contactId: result.contact.id,
    body: text,
    timestamp: ts.toISOString(),
  });
}

/**
 * Callback getMessage exigido pelo Baileys para receipts/retries.
 * Retorna a mensagem armazenada pelo seu waMessageId.
 */
export async function getMessageFromDb(
  key: proto.IMessageKey,
): Promise<proto.IMessage | undefined> {
  if (!key.id) return undefined;
  const stored = await prisma.message.findUnique({ where: { waMessageId: key.id } });
  if (!stored) return undefined;
  // Reconstrói o formato que o Baileys espera.
  return { conversation: stored.body } as proto.IMessage;
}

/** Helper exposto para outros módulos obterem o socket ativo. */
export function getActiveSocket(): WASocket | null {
  return waState.sock;
}
