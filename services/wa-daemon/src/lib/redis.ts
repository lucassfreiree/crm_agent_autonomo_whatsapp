import { Redis } from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

/**
 * Cliente Redis para PUBLICAR eventos (status, mensagens).
 * Conexão única reutilizada por todo o daemon.
 */
export const redisPublisher = new Redis(env.redisUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: false,
  reconnectOnError(err) {
    // Reconecta em erros transient-only
    const targets = ["READONLY", "ECONNREFUSED", "ETIMEDOUT"];
    if (targets.some((t) => err.message.includes(t))) return 2;
    return false;
  },
});

redisPublisher.on("error", (err) => logger.error({ err }, "[redis] erro no publisher"));
redisPublisher.on("connect", () => logger.info("[redis] publisher conectado"));
