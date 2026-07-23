# ════════════════════════════════════════════════════════════════
#  wa-daemon — daemon WhatsApp (Baileys)
#  Roda tsx em produção por simplicidade (sem step de build separado),
#  já que o serviço é pequeno e o hot-path é o socket Baileys, não CPU.
# ════════════════════════════════════════════════════════════════
FROM node:20-slim

# Dependências de sistema para Baileys/protobuf em arm64+x64
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# pnpm
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

# Copia manifestos primeiro para cache de deps
COPY pnpm-workspace.yaml package.json ./
COPY services/wa-daemon/package.json ./services/wa-daemon/
COPY packages/db/package.json ./packages/db/
COPY packages/shared-types/package.json ./packages/shared-types/

# Instala só as deps do workspace (sem dev do painel/worker)
RUN pnpm install --filter @crm/wa-daemon... --filter @crm/db --filter @crm/shared-types

# Copia o código fonte (prisma schema, shared-types, daemon)
COPY packages/ ./packages/
COPY services/wa-daemon/ ./services/wa-daemon/
COPY tsconfig.base.json ./

# Gera o cliente Prisma (precisa do schema copiado)
RUN pnpm --filter @crm/db exec prisma generate

WORKDIR /app/services/wa-daemon

# Diretório de sessão Baileys — bind-mount do host para persistir
RUN mkdir -p /app/baileys-auth
ENV WA_AUTH_DIR=/app/baileys-auth

EXPOSE 3001

# tsx roda TS diretamente; Node 20 suporta --import tsx/esm
CMD ["node", "--import", "tsx/esm", "src/index.ts"]
