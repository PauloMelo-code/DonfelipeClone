FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
RUN apk add --no-cache libc6-compat

# ── Install dependencies ──────────────────────────────────
FROM base AS deps
WORKDIR /app

# O .npmrc precisa vir junto: ele fixa auto-install-peers=false, e o lockfile
# grava essa configuracao. Sem o arquivo, o pnpm do container usa o padrao
# (true), nao bate com o lockfile e --frozen-lockfile aborta com
# ERR_PNPM_LOCKFILE_CONFIG_MISMATCH. E o mesmo .npmrc que mantem o Prisma fora
# da arvore, que foi como os advisories altos foram fechados.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
# TODOS os package.json do workspace, senao --frozen-lockfile falha: o
# lockfile declara 3 projetos (raiz, apps/web e packages/shared) e o pnpm
# recusa instalar quando um deles nao existe em disco.
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN pnpm install --frozen-lockfile

# ── Build ─────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Drizzle nao tem etapa de "generate": o schema E o TypeScript.
RUN pnpm --filter web build

# ── Runtime ───────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# Migracoes SQL + o runner que as aplica no start.
COPY --from=builder /app/apps/web/src/lib/db/migrations ./apps/web/src/lib/db/migrations
COPY --from=builder /app/apps/web/scripts/migrate.mjs ./apps/web/scripts/migrate.mjs

# O output standalone do Next nao inclui o que so o migrate usa.
RUN npm install --no-save drizzle-orm@0.45.2 postgres@3.4.9 bcryptjs@3.0.3

# Fix permissions for nextjs user
RUN mkdir -p /app/apps/web/.next/cache && \
    chown -R nextjs:nodejs /app/apps/web/.next/cache

# Copy entrypoint
COPY docker-entrypoint.sh ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENTRYPOINT ["sh", "docker-entrypoint.sh"]
