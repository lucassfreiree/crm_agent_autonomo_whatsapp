// ════════════════════════════════════════════════════════════════
//  Envio de mensagens com HUMANIZAÇÃO COMPORTAMENTAL
//  - Indicador "digitando" + atraso proporcional ao tamanho da resposta
//  - Quebra respostas longas em vários balões curtos com pausas
//  - Rate-limit (WA_SEND_RATE_PER_MIN) + delays humanos (min/max)
//  - Sem envios em massa: só envia em resposta a NewReplyEvent
// ════════════════════════════════════════════════════════════════
import { Redis } from "ioredis";
import { REDIS_CHANNELS, type NewReplyEvent } from "@crm/shared-types";

import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { waState } from "./state.js";

/**
 * Inicia o consumidor de respostas prontas (canal crm:new-reply).
 * O worker de IA publica aqui quando classifica e gera a resposta humanizada.
 * O daemon é o ÚNICO que envia de fato pelo WhatsApp.
 */
export function startReplyConsumer(): Redis {
  const subscriber = new Redis(env.redisUrl, { maxRetriesPerRequest: null });

  subscriber.on("error", (err) => logger.error({ err }, "[send] erro no subscriber"));

  subscriber.subscribe(REDIS_CHANNELS.NEW_REPLY, (err) => {
    if (err) logger.error({ err }, "[send] falha ao assinar new-reply");
    else logger.info("[send] assinando canal new-reply");
  });

  subscriber.on("message", async (_channel, raw) => {
    try {
      const event = JSON.parse(raw) as NewReplyEvent;
      await sendHumanizedReply(event.jid, event.body);
    } catch (err) {
      logger.error({ err }, "[send] erro ao processar new-reply");
    }
  });

  return subscriber;
}

// ── Rate-limit simples (token bucket por minuto) ──────────────────
let tokensSentThisMinute = 0;
let minuteWindowStart = Date.now();

function consumeToken(): boolean {
  const now = Date.now();
  if (now - minuteWindowStart >= 60_000) {
    tokensSentThisMinute = 0;
    minuteWindowStart = now;
  }
  if (tokensSentThisMinute >= env.sendRatePerMin) {
    return false;
  }
  tokensSentThisMinute++;
  return true;
}

/**
 * Envia uma resposta com comportamento humano:
 * 1. presenceSubscribe + "digitando"
 * 2. delay proporcional ao tamanho (clamp min/max)
 * 3. se longa, quebra em balões curtos com pausas entre eles
 */
export async function sendHumanizedReply(jid: string, body: string): Promise<void> {
  const sock = waState.sock;
  if (!sock) {
    logger.warn({ jid }, "[send] socket inativo, resposta descartada");
    return;
  }

  if (!consumeToken()) {
    logger.warn({ jid }, "[send] rate-limit atingido, resposta descartada");
    // Em produção, aqui re-enfileiraria; por ora descarta para não estourar.
    return;
  }

  // Quebra em balões: por sentenças e/ou quebras explícitas, máx ~280 chars.
  const bubbles = splitIntoBubbles(body);

  for (const [i, bubble] of bubbles.entries()) {
    // Indicador de digitação + delay proporcional ao balão (clamp 1.5–6s).
    try {
      await sock.presenceSubscribe(jid);
      await sock.sendPresenceUpdate("composing", jid);
    } catch {
      /* presence opcional, ignora falhas */
    }

    const delay = clampMs(bubble.length * 35, env.sendMinDelayMs, env.sendMaxDelayMs);
    await sleep(delay);

    try {
      await sock.sendPresenceUpdate("paused", jid);
      const sent = await sock.sendMessage(jid, { text: bubble });

      // Persiste a mensagem enviada no DB (direction OUTBOUND).
      await persistOutbound(jid, bubble, sent?.key?.id ?? undefined);
    } catch (err) {
      logger.error({ err, jid, i }, "[send] erro ao enviar balão");
      return;
    }

    // Pausa natural entre balões (se houver próximo).
    if (i < bubbles.length - 1) {
      await sleep(randomBetween(600, 1500));
    }
  }

  logger.info({ jid, bubbles: bubbles.length }, "[send] resposta enviada");
}

/** Persiste uma mensagem outbound (enviada pela IA ou humano). */
async function persistOutbound(jid: string, body: string, waMessageId?: string): Promise<void> {
  const { prisma } = await import("@crm/db");
  const phone = jid.split("@")[0]?.split(":")[0] ?? jid;
  const contact = await prisma.contact.findUnique({ where: { phone } });
  if (!contact) return; // contato não existe — não deveria acontecer

  const conversation = await prisma.conversation.findFirst({
    where: { contactId: contact.id, status: "active" },
    orderBy: { createdAt: "desc" },
  });
  if (!conversation) return;

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "OUTBOUND",
      body,
      waMessageId: waMessageId ?? undefined,
      aiGenerated: true,
      timestamp: new Date(),
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────

/** Divide texto em balões curtos (por sentenças/newlines, agrupando ~280 chars). */
function splitIntoBubbles(text: string): string[] {
  const MAX = 280;
  // Quebra por newline duplo primeiro (parágrafos), depois por sentença.
  const raw = text.replace(/\r/g, "").split(/\n{2,}|\n/).flatMap((p) =>
    p.split(/(?<=[.!?…])\s+/),
  );
  const bubbles: string[] = [];
  let current = "";
  for (const piece of raw) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    if ((current + " " + trimmed).trim().length > MAX) {
      if (current) bubbles.push(current.trim());
      current = trimmed;
    } else {
      current = current ? `${current} ${trimmed}` : trimmed;
    }
  }
  if (current.trim()) bubbles.push(current.trim());
  // Se o texto inteiro for curto, mantém como 1 balão.
  return bubbles.length ? bubbles : [text.trim()];
}

function clampMs(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
