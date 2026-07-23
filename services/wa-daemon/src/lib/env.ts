// Carrega .env da raiz do monorepo quando rodando fora do Docker (dev local).
import { config } from "dotenv";

config({ path: process.env["NODE_ENV"] === "production" ? ".env" : "../../.env" });

// Validação das variáveis obrigatórias do daemon.
const required = ["DATABASE_URL", "REDIS_URL", "WA_AUTH_DIR", "WA_DAEMON_PORT"] as const;
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(
      `[wa-daemon] variável de ambiente ${key} não definida. Verifique .env na raiz do monorepo.`,
    );
  }
}

export const env = {
  databaseUrl: process.env["DATABASE_URL"]!,
  redisUrl: process.env["REDIS_URL"]!,
  waAuthDir: process.env["WA_AUTH_DIR"]!,
  waDaemonPort: Number(process.env["WA_DAEMON_PORT"] ?? 3001),
  // Anti-banimento: rate-limit e delays humanos.
  sendRatePerMin: Number(process.env["WA_SEND_RATE_PER_MIN"] ?? 12),
  sendMinDelayMs: Number(process.env["WA_SEND_MIN_DELAY_MS"] ?? 2000),
  sendMaxDelayMs: Number(process.env["WA_SEND_MAX_DELAY_MS"] ?? 8000),
  nodeEnv: process.env["NODE_ENV"] ?? "development",
} as const;
