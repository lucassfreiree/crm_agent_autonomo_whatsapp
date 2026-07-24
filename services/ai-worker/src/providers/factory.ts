// ════════════════════════════════════════════════════════════════
//  Factory de provedor de IA
//  Lê AIProviderConfig do banco, decifra a API key e devolve o adapter
//  correto. Retorna NULL se não houver config válida — nesse caso o
//  worker apenas salva as mensagens sem responder/classificar
//  (modo seguro até o usuário configurar a key na aba Config).
// ════════════════════════════════════════════════════════════════
import { prisma } from "@crm/db";
import { decryptApiKey, hasEncryptionKey } from "@crm/shared-types";

import { logger } from "../lib/logger.js";
import type { AIProvider, ResolvedProviderConfig } from "./types.js";
import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { OllamaProvider } from "./ollama.js";

/**
 * Resolve o provedor configurado OU retorna null.
 * null = IA desativada (mensagens são salvas, mas não respondidas/classificadas).
 */
export async function getProvider(): Promise<AIProvider | null> {
  // Sem chave de criptografia configurada = não dá para ler a API key.
  if (!hasEncryptionKey()) {
    logger.warn("[factory] AI_CONFIG_ENCRYPTION_KEY ausente — IA desativada");
    return null;
  }

  const config = await prisma.aIProviderConfig.findUnique({ where: { id: 1 } });
  if (!config) {
    logger.info("[factory] nenhuma configuração de IA — IA desativada");
    return null;
  }

  let apiKey: string;
  try {
    apiKey = decryptApiKey(config.apiKey);
  } catch (err) {
    logger.error({ err }, "[factory] falha ao decifrar API key — chave de criptografia mudou?");
    return null;
  }

  // Ollama não exige API key real, mas os outros provedores sim.
  if (config.provider !== "OLLAMA" && !apiKey) {
    logger.info("[factory] API key vazia — IA desativada");
    return null;
  }

  const resolved: ResolvedProviderConfig = {
    provider: config.provider,
    model: config.model,
    apiKey,
  };

  switch (config.provider) {
    case "OPENAI":
      return new OpenAIProvider(resolved);
    case "ANTHROPIC":
      return new AnthropicProvider(resolved);
    case "OLLAMA":
      return new OllamaProvider(resolved);
    default:
      logger.error({ provider: config.provider }, "[factory] provedor desconhecido");
      return null;
  }
}
