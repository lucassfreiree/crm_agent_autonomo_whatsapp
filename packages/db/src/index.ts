// ════════════════════════════════════════════════════════════════
//  @crm/db — Cliente Prisma centralizado
//  Ponto único de acesso ao banco para todos os serviços.
//  Prisma 7 exige driver adapter (@prisma/adapter-pg).
// ════════════════════════════════════════════════════════════════

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client/client.js";

const connectionString = process.env["DATABASE_URL"];

if (!connectionString) {
  throw new Error(
    "@crm/db: variável de ambiente DATABASE_URL não definida. " +
      "Copie .env.example para .env e preencha a conexão com o Postgres.",
  );
}

const adapter = new PrismaPg({ connectionString });

/**
 * Instância singleton do Prisma Client.
 * Em desenvolvimento, evita múltiplas conexões durante hot-reload.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env["NODE_ENV"] === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}

// Reexporta tipos gerados para uso pelos serviços.
export * from "../generated/client/client.js";
export type { PrismaClient } from "../generated/client/client.js";
