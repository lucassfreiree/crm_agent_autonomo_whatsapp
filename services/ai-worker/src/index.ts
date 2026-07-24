// ════════════════════════════════════════════════════════════════
//  ai-worker — bootstrap
//  Inicia o consumidor de novas mensagens e classifica/responde leads.
//  Graceful shutdown ao receber SIGTERM/SIGINT.
// ════════════════════════════════════════════════════════════════
import "./lib/env.js"; // carrega .env + valida
import { logger } from "./lib/logger.js";
import { startClassificationWorker } from "./worker.js";

let subscriber: ReturnType<typeof startClassificationWorker> | null = null;

async function main(): Promise<void> {
  logger.info("[worker] iniciando ai-worker");
  subscriber = startClassificationWorker();
  logger.info("[worker] ✅ pronto — aguardando mensagens");
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "[worker] encerrando...");
  try {
    await subscriber?.quit();
  } catch {
    /* ignora */
  }
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "[worker] unhandledRejection");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "[worker] uncaughtException");
});

main().catch((err) => {
  logger.fatal({ err }, "[worker] falha fatal no boot");
  process.exit(1);
});
