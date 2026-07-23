// ════════════════════════════════════════════════════════════════
//  @crm/shared-types — Contratos de evento e API entre serviços
//  Estes tipos definem o "protocolo" entre wa-daemon, ai-worker e
//  crm-panel. Mantê-los aqui garante que os 3 serviços concordem.
// ════════════════════════════════════════════════════════════════

/**
 * Evento publicado no Redis quando uma nova mensagem chega do WhatsApp.
 * Consumido pelo ai-worker (Etapa 2) para classificar o lead.
 */
export interface NewMessageEvent {
  /** Id da mensagem gravada no Postgres. */
  messageId: string;
  /** Id da conversa relacionada. */
  conversationId: string;
  /** Id do contato que enviou. */
  contactId: string;
  /** Texto da mensagem recebida. */
  body: string;
  /** Momento em que a mensagem foi recebida (ISO 8601). */
  timestamp: string;
}

/**
 * Resultado estruturado da classificação de IA (Etapa 2).
 * Espelha o schema usado nos Structured Outputs do provedor.
 */
export interface LeadClassificationResult {
  temperature: "QUENTE" | "MEDIO" | "FRIO";
  interestCategory: string;
  summary: string;
  confidence: number;
  nextAction: string | null;
  /** Resposta natural em pt-BR para enviar de volta ao contato. */
  reply: string;
}

/** Canais Redis pub/sub usados entre os serviços. */
export const REDIS_CHANNELS = {
  NEW_MESSAGE: "crm:new-message",
  NEW_REPLY: "crm:new-reply",
  LEAD_UPDATED: "crm:lead-updated",
  /** Ciclo de vida da conexão WhatsApp (estado, QR, número). */
  WA_STATUS: "crm:wa:status",
} as const;

/** Filas BullMQ usadas pelo sistema. */
export const QUEUE_NAMES = {
  CLASSIFY_LEAD: "classify-lead",
  SEND_MESSAGE: "send-message",
} as const;

// ───────────────────────────────────────────────────────────────
//  CONEXÃO WHATSAPP (wa-daemon → painel, via Redis + SSE)
// ───────────────────────────────────────────────────────────────

/** Estado lógico da conexão WhatsApp, exposto ao painel. */
export type WaConnectionState =
  | "disconnected"
  | "connecting"
  | "waiting_for_qr"
  | "connected";

/** Evento publicado no canal crm:wa:status a cada mudança de estado. */
export interface WaStatusEvent {
  state: WaConnectionState;
  /** Número conectado (só dígitos, ex: "5511999999999"). Presente só quando connected. */
  phoneNumber?: string;
  /** String bruta do QR. Presente só quando state === "waiting_for_qr". */
  qr?: string;
  /** Momento do evento (ISO 8601). */
  ts: string;
}

/** Snapshot de status retornado por GET /connection/status do daemon. */
export interface WaStatus {
  state: WaConnectionState;
  phoneNumber?: string;
  qr?: string;
}

// ───────────────────────────────────────────────────────────────
//  OUTROS EVENTOS (preenchidos quando as próximas partes ativarem)
// ───────────────────────────────────────────────────────────────

/** Evento publicado no canal crm:new-reply (resposta pronta para envio). */
export interface NewReplyEvent {
  contactId: string;
  /** JID do WhatsApp para onde enviar (ex: 5511...@s.whatsapp.net). */
  jid: string;
  /** Texto já humanizado a enviar. */
  body: string;
  /** Origem da resposta: "ai" ou "human". */
  source: "ai" | "human";
}

/** Evento publicado no canal crm:lead-updated (lead mudou de estágio/classificação). */
export interface LeadUpdatedEvent {
  leadId: string;
  contactId: string;
  funnelStage: "NOVOS" | "EM_CONVERSA" | "QUALIFICADOS";
  temperature?: "QUENTE" | "MEDIO" | "FRIO";
  ts: string;
}
