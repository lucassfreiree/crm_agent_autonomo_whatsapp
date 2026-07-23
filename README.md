# CRM Agent WhatsApp

Sistema de **atendimento e captação de leads pelo WhatsApp com IA classificadora**, para rodar em VPS única.

Quando alguém envia uma mensagem no WhatsApp, uma IA lê, responde de forma natural e classifica o contato como lead (quente/médio/frio, interesse principal e resumo da conversa). Os leads aparecem em um painel CRM organizado em funil (`NOVOS → EM_CONVERSA → QUALIFICADOS`).

## Arquitetura

```
WhatsApp ──▶ [wa-daemon]  ──escreve──▶  PostgreSQL  ◀──lê──  [crm-panel]
  (Baileys)     │                          ▲                    (Next.js)
  sempre ligado │ publica no Redis         │                    Kanban + Config
                ▼                          │
           [ai-worker] ──classifica + resposta──┘
```

- **PostgreSQL** — fonte de verdade compartilhada.
- **Redis** — pub/sub (eventos de nova mensagem) + BullMQ (filas de classificação e envio).
- **wa-daemon** — daemon sempre ligado com o socket Baileys; separado do painel. Fonte dos dados.
- **ai-worker** — classifica o lead e gera resposta; lê provedor/modelo/API key da tabela `AIProviderConfig` (aba Configurações do painel).
- **crm-panel** — funil Kanban + detalhe do lead + configurações.

A conexão WhatsApp usa **Baileys** (não-oficial, via QR code / pairing code), **não** a API oficial da Meta.

## Estrutura do monorepo (pnpm workspaces)

```
.
├── docker-compose.yml        # Postgres + Redis
├── pnpm-workspace.yaml
├── .env.example              # template de variáveis (copiar para .env)
├── packages/
│   ├── db/                   # @crm/db — Prisma + cliente centralizado
│   │   ├── prisma/schema.prisma
│   │   ├── prisma.config.ts  # Prisma 7 (URL do datasource via config)
│   │   └── src/index.ts      # singleton do PrismaClient + reexporta tipos
│   └── shared-types/         # @crm/shared-types — eventos Redis, filas, DTOs
├── services/
│   ├── wa-daemon/            # @crm/wa-daemon  (Etapa 1)
│   └── ai-worker/            # @crm/ai-worker  (Etapa 2)
└── apps/
    └── crm-panel/            # @crm/crm-panel  (Etapa 3)
```

## Etapas de construção

| Etapa | O quê | Status |
|-------|-------|--------|
| **0 — Fundação** | Monorepo, Docker Compose (Postgres+Redis), Prisma com schema completo + migração | ✅ Concluída |
| **1 — WhatsApp** | Daemon Baileys: QR, persistência de sessão, gravação de mensagens, anti-banimento | ⏳ Pendente |
| **2 — IA** | Worker classificador (Structured Outputs) + aba Configurações com API key | ⏳ Pendente |
| **3 — CRM** | Painel Kanban + detalhe do lead + mecânicas de engajamento | ⏳ Pendente |

## Como rodar a Etapa 0 (fundação)

### Pré-requisitos
- Node.js ≥ 20
- pnpm (`npm i -g pnpm`)
- Docker + Docker Compose

### Passos

```bash
# 1. Instalar dependências dos workspaces
pnpm install

# 2. Configurar ambiente
cp .env.example .env
# Edite .env: defina senhas de Postgres/Redis.
# Para criptografia da API key, gere uma chave:
#   openssl rand -base64 32
# e coloque em AI_CONFIG_ENCRYPTION_KEY.

# 3. Subir Postgres + Redis
pnpm db:up          # = docker compose up -d

# 4. Gerar o cliente Prisma + aplicar migração inicial
pnpm db:generate    # = prisma generate (cria packages/db/generated/)
pnpm db:migrate     # = prisma migrate dev (cria as tabelas)
#   Na primeira execução, dê um nome à migração, ex.: "init"

# 5. (Opcional) Inspecionar o banco
pnpm db:studio      # abre Prisma Studio em http://localhost:5555
```

### Verificação de aceite da Etapa 0
- [x] `docker compose up -d` sobe `crm-postgres` e `crm-redis` saudáveis
- [x] `prisma migrate dev` cria todas as tabelas sem erro
- [x] `pnpm install` resolve os workspaces (`@crm/db`, `@crm/shared-types`, `@crm/wa-daemon`, `@crm/ai-worker`, `@crm/crm-panel`)

## Modelo de dados

Definido em `packages/db/prisma/schema.prisma`. Principais tabelas:

- **Contact** — contato do WhatsApp (phone, jid, lid)
- **Conversation** / **Message** — conversa e mensagens trocadas
- **Lead** / **LeadClassification** — lead no funil + classificação da IA (temperatura, interesse, resumo, confiança, próxima ação)
- **AIProviderConfig** — provedor/modelo/API key (criptografada) — singleton editável pela aba Configurações
- **OutboundMessage** — fila de envio com rate-limit e delays humanos (anti-banimento)

## ⚠️ Aviso sobre banimento

O uso da conexão não-oficial (Baileys) **viola os Termos de Serviço do WhatsApp**. Há risco real de bloqueio do número. Mitigações previstas na Etapa 1: número dedicado, warm-up, rate-limit próprio, delays humanos, reconexão graceful. Para uso comercial em escala, a API oficial (WhatsApp Cloud API) é o caminho recomendado.

## Licença

Privado.
