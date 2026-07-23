// ════════════════════════════════════════════════════════════════
//  Conexão WhatsApp (Baileys 6.7.15)
//  - QR via evento connection.update (não terminal) → publicado no Redis
//  - Sessão persistida em WA_AUTH_DIR (bind-mount do compose)
//  - Reconexão automática com guarda anti-flap (manuallyStopped)
//  - Guarda anti-loop: fromMe checado no handler de mensagens
// ════════════════════════════════════════════════════════════════
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  type WASocket,
  type proto,
} from "./baileys-import.js";
import { Boom } from "@hapi/boom";
import NodeCache from "@cacheable/node-cache";
import { mkdir } from "node:fs/promises";

import { env } from "../lib/env.js";
import { baileysLogger, logger } from "../lib/logger.js";
import { publishWaStatus } from "../lib/publisher.js";
import { waState, resetConnectionFields } from "./state.js";
import { handleIncomingMessage, getMessageFromDb } from "./handlers/messages.js";

// Cache de contagem de retries — DEVE ficar fora do socket (doc Baileys).
const msgRetryCounterCache = new NodeCache({ stdTTL: 0, useClones: false });

/**
 * Garante que o diretório de auth existe (necessário antes do useMultiFileAuthState).
 */
async function ensureAuthDir(): Promise<void> {
  await mkdir(env.waAuthDir, { recursive: true });
}

/**
 * Conecta (ou reconecta) o socket Baileys.
 * Idempotente: se já há uma conexão em andamento, aguarda.
 */
export async function connectToWhatsApp(): Promise<void> {
  if (waState.connecting) {
    logger.warn("[wa] connect ignorado: conexão já em andamento");
    return;
  }
  if (waState.sock) {
    logger.warn("[wa] connect ignorado: socket já ativo");
    return;
  }

  waState.connecting = true;
  waState.manuallyStopped = false;

  try {
    await ensureAuthDir();

    const { state, saveCreds } = await useMultiFileAuthState(env.waAuthDir);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info({ version: version.join("."), isLatest }, "[wa] versão WA");

    const sock = makeWASocket({
      version,
      logger: baileysLogger,
      // QR vem pelo evento; não imprime no terminal.
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
      },
      msgRetryCounterCache: msgRetryCounterCache as never,
      // Necessário para receipts/retries: Baileys pede o corpo original.
      getMessage: getMessageFromDb,
      // Não marca "online" automaticamente ao receber (menos fingerprint).
      markOnlineOnConnect: false,
      browser: Browsers.ubuntu("Chrome"),
    });

    waState.sock = sock;

    // ── Eventos de conexão ───────────────────────────────────────
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // QR disponível → publica para o painel exibir.
        waState.lastQr = qr;
        await publishWaStatus({ state: "waiting_for_qr", qr });
        logger.info("[wa] QR gerado — aguardando leitura");
      }

      if (connection === "connecting") {
        await publishWaStatus({ state: "connecting" });
        logger.info("[wa] conectando...");
      }

      if (connection === "open") {
        // Conectado — extrai o número de sock.user.id (formato: 5511...:1@s.whatsapp.net).
        const me = sock.user;
        const jid = me?.id ?? "";
        const phone = jid.split(":")[0]?.split("@")[0];
        waState.phoneNumber = phone;
        waState.lastQr = undefined;
        await publishWaStatus({ state: "connected", phoneNumber: phone });
        logger.info({ phone }, "[wa] ✅ conectado");
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        resetConnectionFields();

        if (loggedOut) {
          // Sessão morta (logout explícito ou banimento) — não reconecta.
          await publishWaStatus({ state: "disconnected" });
          logger.error({ statusCode }, "[wa] ❌ sessão encerrada (loggedOut). Reescanear QR necessário.");
          return;
        }

        if (waState.manuallyStopped) {
          // Usuário desligou pelo painel — mantém sessão, não reconecta.
          await publishWaStatus({ state: "disconnected" });
          logger.info("[wa] desconectado manualmente (sessão preservada)");
          return;
        }

        // Queda transitória — reconecta com backoff simples.
        logger.warn({ statusCode }, "[wa] conexão caiu, reconectando em 2s...");
        await publishWaStatus({ state: "connecting" });
        await sleep(2000);
        void connectToWhatsApp().catch((err) =>
          logger.error({ err }, "[wa] erro ao reconectar"),
        );
      }
    });

    // ── Salvar credenciais sempre que mudarem ─────────────────────
    sock.ev.on("creds.update", saveCreds);

    // ── Mensagens recebidas ──────────────────────────────────────
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      // type "notify" = entrega nova; "append" = histórico/eco — ignoramos append.
      if (type !== "notify") return;
      for (const msg of messages) {
        try {
          await handleIncomingMessage(msg);
        } catch (err) {
          logger.error({ err, key: msg.key }, "[wa] erro ao processar mensagem");
        }
      }
    });
  } catch (err) {
    logger.error({ err }, "[wa] erro ao iniciar socket");
    resetConnectionFields();
    throw err;
  } finally {
    waState.connecting = false;
  }
}

/**
 * Desconecta mantendo a sessão (botão "Desligar").
 * O close handler respeitará manuallyStopped e não reconectará.
 */
export async function disconnectWhatsApp(): Promise<void> {
  waState.manuallyStopped = true;
  const sock = waState.sock;
  if (sock?.ws) {
    // ws.close() dispara connection.update com connection="close" (statusCode 428).
    // Como manuallyStopped=true, o handler apenas publica "disconnected" sem reconectar.
    sock.ws.close();
  }
  resetConnectionFields();
  await publishWaStatus({ state: "disconnected" });
  logger.info("[wa] desconectado (sessão preservada)");
}

/**
 * Desconecta E apaga a sessão (forçará novo QR no próximo connect).
 */
export async function logoutWhatsApp(): Promise<void> {
  waState.manuallyStopped = true;
  const sock = waState.sock;
  if (sock) {
    try {
      await sock.logout();
    } catch (err) {
      logger.warn({ err }, "[wa] erro no logout (seguindo)");
    }
  }
  resetConnectionFields();
  await publishWaStatus({ state: "disconnected" });
  logger.info("[wa] logout — sessão apagada");
}

/**
 * Snapshot síncrono do estado atual (para a API REST).
 */
export function getStatus() {
  if (waState.phoneNumber) {
    return { state: "connected" as const, phoneNumber: waState.phoneNumber };
  }
  if (waState.lastQr) {
    return { state: "waiting_for_qr" as const, qr: waState.lastQr };
  }
  if (waState.sock) {
    return { state: "connecting" as const };
  }
  return { state: "disconnected" as const };
}

// ── Helpers ──────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Reexporta o tipo do socket para outros módulos.
export type { WASocket, proto };
