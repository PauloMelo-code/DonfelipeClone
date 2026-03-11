FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
RUN apk add --no-cache libc6-compat

# ── Install dependencies ──────────────────────────────────
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile

# ── Build ─────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN pnpm db:generate
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

# Copy prisma schema + client runtime
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.pnpm/@prisma+client*/node_modules/.prisma ./node_modules/.prisma

# Install prisma CLI + bcryptjs (pnpm symlinks don't copy properly)
RUN npm install --no-save prisma@6.19.2 @prisma/engines@6.19.2 bcryptjs@3.0.3

# Copy entrypoint
COPY docker-entrypoint.sh ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENTRYPOINT ["sh", "docker-entrypoint.sh"]
