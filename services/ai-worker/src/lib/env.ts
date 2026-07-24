import { config } from "dotenv";

config({ path: process.env["NODE_ENV"] === "production" ? ".env" : "../../.env" });

const required = ["DATABASE_URL", "REDIS_URL"] as const;
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`[ai-worker] variável de ambiente ${key} não definida.`);
  }
}

export const env = {
  databaseUrl: process.env["DATABASE_URL"]!,
  redisUrl: process.env["REDIS_URL"]!,
  // Quantas mensagens do histórico enviar ao LLM como contexto.
  historyLimit: Number(process.env["AI_CLASSIFY_MIN_MESSAGES"] ?? 10),
  nodeEnv: process.env["NODE_ENV"] ?? "development",
} as const;
