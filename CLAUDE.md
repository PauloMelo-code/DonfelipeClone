# Cugini Repasses - Plataforma de Monitoramento de Veiculos

## Visao Geral
Sistema automatizado que monitora grupos de WhatsApp de repasse de veiculos, extrai dados com IA (GPT-4o), permite revisao humana, aplica margem de lucro e republica nos grupos de venda.

## Stack
- Monorepo pnpm + Turborepo
- Next.js 16 + React 19 + TypeScript
- Prisma ORM + SQLite (dev) / PostgreSQL (prod)
- NextAuth v4 (JWT)
- UAZAPI (WhatsApp API)
- OpenAI GPT-4o (extracao de veiculos)
- shadcn/ui + Magic UI + Tremor + Framer Motion
- Tema dark com paleta preto/cinza/laranja

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

## Credenciais Dev
- Login: admin@cugini.com.br / admin123

## Regras de Negocio
1. Deduplicacao: mesmo carro so reposta 1x a cada 2 dias uteis
2. Hibrido: se fuel=HIBRIDO, transmissao vira "HIBRIDO" no anuncio
3. Anti-ban: delays aleatorios + presenca "composing" antes de enviar
4. Margem: configuravel via settings (padrao 10%)

## Estrutura Principal
- apps/web/ - Frontend + API Next.js
- prisma/ - Schema e seed
- packages/shared/ - Tipos compartilhados
