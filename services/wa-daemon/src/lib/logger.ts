import pino from "pino";

// Logger estruturado. Em dev, pino-pretty para legibilidade; em prod, JSON.
export const logger = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  ...(process.env["NODE_ENV"] !== "production"
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
      }
    : {}),
});

/** Logger Baileys — silencioso por padrão (Baileys é verboso em trace). */
export const baileysLogger = pino({ level: "silent" });
