# ════════════════════════════════════════════════════════════════
#  ai-worker — classificador de leads (IA)
# ════════════════════════════════════════════════════════════════
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml package.json ./
COPY services/ai-worker/package.json ./services/ai-worker/
COPY packages/db/package.json ./packages/db/
COPY packages/shared-types/package.json ./packages/shared-types/

RUN pnpm install --filter @crm/ai-worker... --filter @crm/db --filter @crm/shared-types

COPY packages/ ./packages/
COPY services/ai-worker/ ./services/ai-worker/
COPY tsconfig.base.json ./

RUN pnpm --filter @crm/db exec prisma generate

WORKDIR /app/services/ai-worker

CMD ["node", "--import", "tsx/esm", "src/index.ts"]
