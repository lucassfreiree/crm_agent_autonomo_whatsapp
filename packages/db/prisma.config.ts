// Prisma 7: a URL do datasource agora vem do prisma.config.ts.
// Veja: https://pris.ly/d/prisma-config
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// O .env vive na raiz do monorepo; este arquivo roda de packages/db.
config({ path: "../../.env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Em dev, DATABASE_URL aponta para o Postgres do docker-compose.
    url: process.env["DATABASE_URL"],
  },
});
