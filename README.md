# Don Felipe Repasses

Plataforma de monitoramento e republicação de veículos. Acompanha grupos de WhatsApp de repasse,
extrai os dados do carro com IA, deixa a pessoa revisar, aplica a margem e **republica** nos grupos
de venda.

```
GRUPO DE REPASSE ──webhook UAZAPI──> captura ──> IA extrai (GPT-4o)
                                                      │
                                    ┌─────────────────┼──────────────────┐
                                    ▼                 ▼                  ▼
                              dedup 30 dias    foto destaque      score de qualidade
                              (fica o + barato)  (Gemini/GPT)
                                    │
                                    ▼
                          REVISÃO HUMANA ──> margem ──> publisher ──> GRUPOS DE VENDA
                                                        (anti-ban)
```

## Stack

Monorepo **pnpm + Turborepo** · Next.js 16 + React 19 + TypeScript · **Prisma + PostgreSQL** ·
NextAuth v4 (JWT) · **UAZAPI** (WhatsApp) · **OpenAI GPT-4o** para extração e **Gemini 2.5 Flash**
para escolha de foto e fallback · shadcn/ui + Magic UI + Tremor + Framer Motion · tema dark.

```
apps/web/          frontend + API (Next.js)
  src/lib/         regra de negocio: ai, ad-cleaner, photo-picker, gemini,
                   deduplication, publisher, vehicle-formatter, vehicle-parser,
                   quality-score, vip-detection, uazapi, rejection-learning
  src/app/         (auth)/login e (dashboard)/{veiculos, publicacoes, grupos,
                   auditoria, insights, configuracoes, templates, usuarios}
packages/shared/   tipos compartilhados
prisma/            schema (8 models) + seed
```

## Setup

```bash
pnpm install
cp .env.example .env          # preencher (ver abaixo)
pnpm db:generate
pnpm db:push
SEED_ADMIN_PASSWORD='<senha forte, 15+ caracteres>' pnpm db:seed
pnpm dev                      # http://localhost:3000
```

O seed cria `admin@donfelipe.com.br` com a senha que você passar em
`SEED_ADMIN_PASSWORD`. **Nunca** escreva a senha aqui nem no `CLAUDE.md`: os dois
são versionados. O seed também **apaga** todas as tabelas antes de popular, então
ele não roda sozinho no start do container — é comando explícito.

Variáveis de ambiente:

| Grupo | Variáveis |
|---|---|
| Banco | `DATABASE_URL` |
| Auth | `NEXTAUTH_SECRET` |
| WhatsApp | `UAZAPI_BASE_URL`, `UAZAPI_TOKEN`, `UAZAPI_SEND_BASE_URL`, `UAZAPI_SEND_TOKEN` |
| IA | `OPENAI_API_KEY`, `GEMINI_API_KEY` |
| Integração | `WEBHOOK_SECRET`, `HEALTH_MONITOR_SECRET` |

> Nunca comite `.env` nem nenhuma dessas chaves.

## Comandos

```bash
pnpm dev              # turbo run dev
pnpm build
pnpm lint
pnpm db:generate      # Prisma client
pnpm db:push          # sincroniza o schema com o banco
pnpm db:seed
pnpm db:studio
```

> **Não há teste automatizado.** `pnpm build` e `pnpm lint` são a única verificação automática do
> projeto.

## As regras que sustentam o produto

Detalhe completo em [docs/MAPEAMENTO-PROJETO.md](docs/MAPEAMENTO-PROJETO.md) e [AGENTS.md](AGENTS.md).

- **Preço ≠ FIPE.** Nunca copiar um para o outro. Dois valores sem rótulo: o maior é FIPE, o menor é
  venda — e só se a diferença ficar entre 3% e 50%.
- **Formato brasileiro de valor**: `78.200,00` e `78.200.00` são os dois 78200, nunca 7.820.000.
- **Deduplicação de 30 dias**, exata e fuzzy (ano ±1, km ±20%, modelo normalizado). Entre
  duplicatas, fica a de menor preço.
- **Anti-ban**: presença "composing" e delay aleatório configurável antes de cada envio.
- **Margem, delays e km máxima são configuráveis** na tela de Configurações — nunca no código.

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/MAPEAMENTO-PROJETO.md](docs/MAPEAMENTO-PROJETO.md) | **Referência principal** — pipeline de captura, motor de IA, publicação, modelo de dados, configurações e a linha do tempo do projeto |
| [CLAUDE.md](CLAUDE.md) | Stack, comandos e regras de negócio em uma página |
| [AGENTS.md](AGENTS.md) | Invariantes, regras por domínio e dívidas conhecidas |
| [TAREFAS-AMANHA.md](TAREFAS-AMANHA.md) | Checklist de abril, ainda com pendências |
| `Cugini-Guia-do-Sistema.docx` | Guia do usuário final, feito à mão |

### Para agentes de IA

| Arquivo | Para quem |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Claude Code |
| [AGENTS.md](AGENTS.md) | Codex, Cursor, Copilot e agentes genéricos |
| [.agents/rules/don-felipe-repasses.md](.agents/rules/don-felipe-repasses.md) | Antigravity — regras do workspace |
| [.agents/workflows/bugfix.md](.agents/workflows/bugfix.md) · [.agents/workflows/feature.md](.agents/workflows/feature.md) | Passo a passo por tipo de tarefa |
| `.claude/skills/how-to-use-guide/` | Gera guia "como usar" em PDF, com prints reais e dados anonimizados |

## Dívidas conhecidas

- **Renomeação em andamento, sem commit.** No git (HEAD) o projeto é **Cugini**; no working tree
  há **173 arquivos modificados** renomeando para **Don Felipe** — feito em 31/08 às 13:06. O
  estado é misto: ~126 ocorrências de "cugini" e ~37 de "don felipe" convivem no código. O roteiro
  da troca é a seção 11 do [docs/MAPEAMENTO-PROJETO.md](docs/MAPEAMENTO-PROJETO.md). **Antes de
  gerar qualquer material com print, decida qual nome vale** — senão o guia sai com os dois.
- `veiculos/page.tsx` (2.509 linhas) e `grupos/page.tsx` (1.366) violam a regra de 500 linhas.
- Sem testes automatizados.
- `apps/web/cookies.txt` está versionado. Hoje está vazio de dados, mas não deveria estar no repo.
