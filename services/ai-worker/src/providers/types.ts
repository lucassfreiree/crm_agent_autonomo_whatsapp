// ════════════════════════════════════════════════════════════════
//  Interface do provedor de IA
//  Todo adapter (OpenAI/Anthropic/Ollama) implementa classifyAndReply().
//  O factory decide qual usar com base em AIProviderConfig.
// ════════════════════════════════════════════════════════════════
import type { LeadClassificationResult } from "@crm/shared-types";

/** Uma mensagem do histórico da conversa, na perspectiva do bot. */
export interface ConversationTurn {
  /** "inbound" = o lead escreveu; "outbound" = o bot já respondeu. */
  role: "inbound" | "outbound";
  text: string;
}

/** Contexto passado ao provedor para classificar e gerar a resposta. */
export interface ClassifyContext {
  /** Nome do contato (pushName do WhatsApp), se disponível. */
  contactName?: string;
  /** Telefone do contato. */
  contactPhone: string;
  /** A mensagem nova que chegou. */
  newMessage: string;
  /** Histórico recente da conversa (ordenado do mais antigo ao mais novo). */
  history: ConversationTurn[];
  /** Nome do negócio, para contextualizar a resposta. */
  businessName?: string;
}

/** Contrato que todo provedor de IA implementa. */
export interface AIProvider {
  /** Nome do provedor (para logs). */
  readonly name: string;

  /**
   * Lê o contexto da conversa e devolve:
   *  - classificação do lead (temperatura, interesse, resumo, etc.)
   *  - resposta natural em pt-BR para enviar de volta (já no prompt humanizado)
   */
  classifyAndReply(ctx: ClassifyContext): Promise<LeadClassificationResult>;
}

/** Configuração resolvida do provedor (lida de AIProviderConfig + decrypt). */
export interface ResolvedProviderConfig {
  provider: "OPENAI" | "ANTHROPIC" | "OLLAMA";
  model: string;
  apiKey: string;
  /** Base URL opcional (ex: endpoint do Ollama ou proxy). */
  baseUrl?: string;
}
