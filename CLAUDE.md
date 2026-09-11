# Don Felipe Repasses - Plataforma de Monitoramento de Veiculos

## Visao Geral
Sistema automatizado que monitora grupos de WhatsApp de repasse de veiculos, extrai dados com IA (GPT-4o), permite revisao humana, aplica margem de lucro e republica nos grupos de venda.

## Stack
- Monorepo pnpm + Turborepo
- Next.js 16 + React 19 + TypeScript
- **Drizzle ORM + PostgreSQL** (dev e prod). O Prisma foi removido em set/2026
- NextAuth v4 (JWT)
- UAZAPI (WhatsApp API)
- **OpenAI GPT-4o** (extracao) + **Gemini 2.5 Flash** (escolha de foto e fallback de qualidade)
  - `lib/ai.ts` extrai · `lib/ad-cleaner.ts` limpa anuncio de agregador · `lib/photo-picker.ts`
    escolhe a foto destaque (Gemini primeiro, GPT-4o-mini como fallback) · `lib/gemini.ts` e o
    cliente de fallback: sem `GEMINI_API_KEY` devolve `null` e o texto original e mantido
- shadcn/ui + Magic UI + Tremor + Framer Motion
- Tema dark: preto puro + dourado da marca. Tokens e regras em `docs/design-system.md`

## Comandos
```bash
pnpm install          # Instalar dependencias
pnpm dev              # Iniciar dev server
pnpm db:generate      # Gerar Prisma client
pnpm db:push          # Sincronizar schema com banco
pnpm db:seed          # Popular banco com dados iniciais
pnpm db:studio        # Abrir Prisma Studio
pnpm build            # Build de producao
```

## Primeiro Acesso

NUNCA escreva senha neste arquivo — ele e versionado. A senha do primeiro
administrador vem de `SEED_ADMIN_PASSWORD` e o seed nao roda sozinho:

```bash
SEED_ADMIN_PASSWORD='<senha forte, 15+ caracteres>' pnpm db:seed
```

Regras de login e conta em `docs/seguranca-login.md` (estrutura base).
Auditoria: skill `/audit-auth-security`.

## Regras de Negocio
1. Deduplicacao: janela de **30 dias**, com match exato por `identityHash` e **fuzzy** (ano +-1,
   km +-20%, modelo normalizado). Entre duplicatas, **fica a de menor preco**. Ver
   `lib/deduplication.ts`
2. Hibrido: se fuel=HIBRIDO, transmissao vira "HIBRIDO" no anuncio
3. Anti-ban: presenca "composing" + delay aleatorio configuravel (`delay_min_seconds` /
   `delay_max_seconds`, padrao 1-3s). A publicacao rapida do admin usa 0,3-1s e pula o composing
4. Margem: configuravel via settings (padrao 10%)

## Estrutura Principal
- apps/web/ - Frontend + API Next.js
- prisma/ - Schema e seed
- packages/shared/ - Tipos compartilhados
