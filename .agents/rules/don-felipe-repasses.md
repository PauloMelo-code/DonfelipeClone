# Regras do workspace — Don Felipe Repasses

Regras para o agente do Antigravity / Codex neste repositório. **A fonte completa é o
[AGENTS.md](../../AGENTS.md) e o [CLAUDE.md](../../CLAUDE.md) na raiz** — este arquivo é o resumo
operacional, não um segundo conjunto de regras. Se divergirem, vale a raiz.

## Contexto

Plataforma que monitora grupos de WhatsApp de repasse de veículos, extrai os dados com IA, deixa a pessoa revisar, aplica a margem e **republica** nos grupos de venda.

**Publica anúncio com preço em grupo real.** Erro de extração vira carro anunciado pelo valor da FIPE em vez do de venda; erro de anti-ban derruba o número da operação.

Monorepo pnpm + Turborepo · Next.js 16 + React 19 + TypeScript · **Drizzle + PostgreSQL** · NextAuth v4 (JWT) · UAZAPI (WhatsApp) · **OpenAI GPT-4o** (extração) + **Gemini 2.5 Flash** (foto e fallback) · shadcn/ui + Tremor + Framer Motion · tema dark preto + dourado (ver `docs/design-system.md`).

## Ordem de leitura

1. `docs/MAPEAMENTO-PROJETO.md` — 390 linhas cobrindo o sistema inteiro. É a referência; **não duplique**
2. `CLAUDE.md` — stack, comandos e regras de negócio em uma página
3. `apps/web/src/lib/ai.ts` — o prompt de extração, se for mexer em IA
4. `apps/web/src/lib/vehicle-formatter.ts` — o formato do anúncio
5. O arquivo real que você vai alterar

## Invariantes

1. **Preço ≠ FIPE.** Nunca copiar um para o outro; se a única cifra estiver na linha da FIPE, `price = null`
2. **Dois valores sem rótulo**: maior é FIPE, menor é venda — válido só se a diferença ficar entre 3% e 50%
3. **Formato brasileiro**: `78.200,00` = 78200 e `78.200.00` (ponto duplo) = 78200, nunca 7.820.000
4. **Chamada promocional não é modelo** — "Menor valor Brasil", "VAAPTY ITAJAÍ", "Oportunidade" fazem pular para a segunda linha
5. **Dedup de 30 dias**, exato (`identityHash`) e fuzzy (ano ±1, km ±20%, modelo normalizado); entre duplicatas **fica a de menor preço**
6. **Anti-ban**: presença "composing" + delay aleatório configurável. A publicação rápida do admin (0,3–1s, sem composing) é a única exceção
7. **Sem `GEMINI_API_KEY` o fallback devolve `null`** e o texto original é mantido — degradar com elegância, nunca quebrar
8. **Híbrido**: se `fuel = HIBRIDO`, a transmissão vira "HIBRIDO" no anúncio
9. **Margem é configurável** na tabela `Setting` (padrão 10%) — nunca hardcoded
10. **Ação relevante vai para `AuditLog`**, com IP e dispositivo

## Proibido

- Reescrever trecho do prompt de `lib/ai.ts` sem ler o histórico de commits — cada regra ali veio de um erro real
- Hardcodar margem, delay de anti-ban ou km máxima (são `Setting`)
- Publicar sem passar pelo dedup
- Quebrar quando o Gemini não estiver configurado
- Logar telefone, nome de grupo ou conteúdo de mensagem em texto claro
- Comitar `.env`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `UAZAPI_TOKEN`, `WEBHOOK_SECRET`
- Expor ou ampliar as rotas `admin/reset-vehicles`, `admin/fix-inflated-prices`, `admin/fix-vehicle-names`

## Comandos

`pnpm install` · `pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm db:generate` · `pnpm db:push` · `pnpm db:seed` · `pnpm db:studio`

## Atenção

Duas coisas específicas deste repo: (1) **não há teste automatizado** — `pnpm build` e `pnpm lint` são a única rede, então descreva o teste manual no relatório; (2) as telas `veiculos/page.tsx` (2.509 linhas) e `grupos/page.tsx` (1.366) violam a regra de 500 linhas e são candidatas a split — se você for mexer numa delas, considere quebrar o pedaço que tocar.
