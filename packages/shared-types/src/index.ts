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
} as const;

/** Filas BullMQ usadas pelo sistema. */
export const QUEUE_NAMES = {
  CLASSIFY_LEAD: "classify-lead",
  SEND_MESSAGE: "send-message",
} as const;
