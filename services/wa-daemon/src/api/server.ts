// ════════════════════════════════════════════════════════════════
//  API REST interna do daemon (fastify)
//  Endpoints consumidos pelo painel CRM:
//    GET  /connection/status   — snapshot { state, phoneNumber?, qr? }
//    POST /connection/connect  — liga (mostra QR se sessão nova)
//    POST /connection/disconnect — desliga mantendo sessão; {logout:true} apaga
//    POST /send                — envio manual (humano assume)
//    GET  /health              — healthcheck do compose
// ════════════════════════════════════════════════════════════════
import Fastify, { type FastifyInstance } from "fastify";

import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import {
  connectToWhatsApp,
  disconnectWhatsApp,
  logoutWhatsApp,
  getStatus,
} from "../baileys/connection.js";
import { sendHumanizedReply } from "../baileys/send.js";

export function buildApiServer(): FastifyInstance {
  const app = Fastify({ logger: false });

  // ── Health ────────────────────────────────────────────────────
  app.get("/health", async () => ({ status: "ok", uptime: process.uptime() }));

  // ── Status snapshot ───────────────────────────────────────────
  app.get("/connection/status", async () => getStatus());

  // ── Ligar ─────────────────────────────────────────────────────
  app.post("/connection/connect", async (_req, reply) => {
    try {
      await connectToWhatsApp();
      return { ok: true };
    } catch (err) {
      logger.error({ err }, "[api] connect falhou");
      return reply.status(500).send({ ok: false, error: "connect_failed" });
    }
  });

  // ── Desligar (mantém sessão por padrão; logout apaga) ─────────
  app.post<{ Body: { logout?: boolean } }>(
    "/connection/disconnect",
    async (req, reply) => {
      try {
        if (req.body?.logout) {
          await logoutWhatsApp();
        } else {
          await disconnectWhatsApp();
        }
        return { ok: true };
      } catch (err) {
        logger.error({ err }, "[api] disconnect falhou");
        return reply.status(500).send({ ok: false, error: "disconnect_failed" });
      }
    },
  );

  // ── Envio manual (humano assume pelo painel) ──────────────────
  app.post<{ Body: { to: string; text: string } }>(
    "/send",
    async (req, reply) => {
      const { to, text } = req.body ?? {};
      if (!to || !text) {
        return reply.status(400).send({ ok: false, error: "to_and_text_required" });
      }
      // Validação leve de JID individual.
      if (!to.endsWith("@s.whatsapp.net")) {
        return reply.status(400).send({ ok: false, error: "individual_jid_only" });
      }
      try {
        await sendHumanizedReply(to, text);
        return { ok: true };
      } catch (err) {
        logger.error({ err }, "[api] send falhou");
        return reply.status(500).send({ ok: false, error: "send_failed" });
      }
    },
  );

  return app;
}

/** Sobe a API na porta configurada. */
export async function startApi(): Promise<FastifyInstance> {
  const app = buildApiServer();
  await app.listen({ port: env.waDaemonPort, host: "0.0.0.0" });
  logger.info({ port: env.waDaemonPort }, "[api] REST interna ouvindo");
  return app;
}
