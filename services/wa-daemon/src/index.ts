// ════════════════════════════════════════════════════════════════
//  wa-daemon — bootstrap
//  1. Sobe a API REST interna (painel chama connect/disconnect/status/send)
//  2. Inicia o consumidor de respostas (canal crm:new-reply → envia no WA)
//  3. Auto-conecta o WhatsApp se houver sessão salva (senão espera o painel ligar)
//  4. Graceful shutdown: desconecta limpo ao receber SIGTERM/SIGINT
// ════════════════════════════════════════════════════════════════
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";

import "./lib/env.js"; // carrega .env + valida
import { logger } from "./lib/logger.js";
import { env } from "./lib/env.js";
import { startApi } from "./api/server.js";
import { startReplyConsumer } from "./baileys/send.js";
import { connectToWhatsApp, disconnectWhatsApp } from "./baileys/connection.js";
import { publishWaStatus } from "./lib/publisher.js";

async function hasSavedSession(): Promise<boolean> {
  // useMultiFileAuthState grava creds.json + arquivos de chaves.
  // Se o diretório existe e tem arquivos além de vazio, há sessão.
  if (!existsSync(env.waAuthDir)) return false;
  try {
    const files = await readdir(env.waAuthDir);
    return files.some((f) => f.endsWith(".json"));
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  logger.info("[daemon] iniciando wa-daemon");

  // Estado inicial.
  await publishWaStatus({ state: "disconnected" });

  // 1. API REST interna.
  await startApi();

  // 2. Consumidor de respostas (IA/humano → envio no WhatsApp).
  startReplyConsumer();

  // 3. Auto-conecta se já há sessão salva (não pede QR de novo).
  if (await hasSavedSession()) {
    logger.info("[daemon] sessão salva encontrada — conectando automaticamente");
    await connectToWhatsApp().catch((err) =>
      logger.error({ err }, "[daemon] auto-conexão falhou"),
    );
  } else {
    logger.info("[daemon] sem sessão salva — aguardando ativação pelo painel");
  }

  logger.info("[daemon] ✅ pronto");
}

// ── Graceful shutdown ────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "[daemon] encerrando...");
  try {
    await disconnectWhatsApp();
  } catch (err) {
    logger.error({ err }, "[daemon] erro no shutdown");
  }
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "[daemon] unhandledRejection");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "[daemon] uncaughtException");
});

main().catch((err) => {
  logger.fatal({ err }, "[daemon] falha fatal no boot");
  process.exit(1);
});
