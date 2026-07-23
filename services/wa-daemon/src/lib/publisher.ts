import { redisPublisher } from "./redis.js";
import { REDIS_CHANNELS, type WaStatusEvent } from "@crm/shared-types";
import type { NewMessageEvent, NewReplyEvent } from "@crm/shared-types";
import { logger } from "./logger.js";

/** Publica o estado da conexão WhatsApp no canal de status. */
export async function publishWaStatus(event: Omit<WaStatusEvent, "ts">): Promise<void> {
  const payload: WaStatusEvent = { ...event, ts: new Date().toISOString() };
  // Mantemos também um snapshot "atual" em SET para GET /status responder imediato.
  await redisPublisher.set("wa:status:current", JSON.stringify(payload));
  await redisPublisher.publish(REDIS_CHANNELS.WA_STATUS, JSON.stringify(payload));
  logger.debug({ state: payload.state, phone: payload.phoneNumber }, "[pub] wa:status");
}

/** Snapshot de status para GET /connection/status (lê do cache Redis). */
export async function getCurrentStatus(): Promise<WaStatusEvent | null> {
  const raw = await redisPublisher.get("wa:status:current");
  return raw ? (JSON.parse(raw) as WaStatusEvent) : null;
}

/** Publica uma nova mensagem recebida → dispara a fila de classificação. */
export async function publishNewMessage(event: NewMessageEvent): Promise<void> {
  await redisPublisher.publish(REDIS_CHANNELS.NEW_MESSAGE, JSON.stringify(event));
  logger.debug({ messageId: event.messageId }, "[pub] new-message");
}

/** Publica uma resposta pronta para envio (vinda do worker de IA ou do humano). */
export async function publishNewReply(event: NewReplyEvent): Promise<void> {
  await redisPublisher.publish(REDIS_CHANNELS.NEW_REPLY, JSON.stringify(event));
  logger.debug({ contactId: event.contactId }, "[pub] new-reply");
}
