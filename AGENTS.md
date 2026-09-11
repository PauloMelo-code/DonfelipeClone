# AGENTS.md — Don Felipe Repasses

Instruções obrigatórias para qualquer agente de IA (Codex, Antigravity, Cursor, Copilot) neste
repositório. Claude Code lê o [CLAUDE.md](CLAUDE.md) — mantenha os dois em sincronia.

> **O sistema publica anúncios em grupos de WhatsApp reais, com preço.** Um erro de extração vira
> carro anunciado pelo valor da FIPE em vez do de venda; um erro de anti-ban derruba o número da
> operação. Leia antes de escrever.

## 1. O que o sistema faz

Monitora grupos de WhatsApp de repasse, extrai os dados do veículo com IA, deixa a pessoa revisar,
aplica a margem e **republica** nos grupos de venda.

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

## 2. Ordem de leitura obrigatória

1. **[docs/MAPEAMENTO-PROJETO.md](docs/MAPEAMENTO-PROJETO.md)** — 390 linhas cobrindo o sistema
   inteiro: pipeline de captura, motor de IA, publicação, configurações e a linha do tempo do
   projeto. É a documentação de referência; **não duplique o conteúdo dela**
2. [CLAUDE.md](CLAUDE.md) — stack, comandos e as regras de negócio em uma página
3. `apps/web/src/lib/ai.ts` — o prompt de extração, se for mexer em IA
4. `apps/web/src/lib/vehicle-formatter.ts` — o formato do anúncio
5. O arquivo real que você vai alterar

## 3. Invariantes — nunca quebrar

| # | Invariante | Onde vive |
| :-- | :--- | :--- |
| 1 | **Preço ≠ FIPE.** Nunca copiar um para o outro. Se a única cifra estiver na linha da FIPE, `price = null` | `lib/ai.ts` |
| 2 | **Dois valores sem rótulo**: o maior é FIPE, o menor é venda — e só vale se a diferença ficar entre **3% e 50%** | `lib/ai.ts` |
| 3 | **Formato brasileiro**: `78.200,00` = 78200 e `78.200.00` (ponto duplo) = 78200, **não** 7.820.000 | `lib/vehicle-parser.ts` |
| 4 | **Chamada promocional não é modelo** — "Menor valor Brasil", "VAAPTY ITAJAÍ", "Oportunidade" fazem pular para a segunda linha | `lib/ai.ts` |
| 5 | **Dedup de 30 dias**, exato (`identityHash`) e **fuzzy** (ano ±1, km ±20%, modelo normalizado). Entre duplicatas, **fica a de menor preço** | `lib/deduplication.ts` |
| 6 | **Anti-ban**: presença "composing" + delay aleatório (`delay_min_seconds`/`delay_max_seconds`, padrão 1–3s). A publicação rápida do admin usa 0,3–1s e pula o composing — **é a única exceção** | `lib/publisher.ts` |
| 7 | **Sem `GEMINI_API_KEY` o fallback devolve `null`** e o consumidor mantém o texto original. Degradar com elegância, nunca quebrar | `lib/gemini.ts` |
| 8 | **Híbrido**: se `fuel = HIBRIDO`, a transmissão vira "HIBRIDO" no anúncio | `lib/vehicle-formatter.ts` |
| 9 | **Margem é configurável** (`Setting`, padrão 10%) — nunca hardcoded | tabela `Setting` |
| 10 | **Toda ação relevante vai para `AuditLog`**, com IP e dispositivo | `lib/request-meta.ts` |

## 4. Regras por domínio

### Motor de IA
`lib/ai.ts` tem 959 linhas de prompt, e **cada regra ali veio de um erro real em produção** — GPT
confundindo KM com CV, lendo FIPE como preço, tratando "EXCLUSIVIDADE" como modelo. Antes de
reescrever qualquer trecho, leia o histórico de commits daquele arquivo. O que parece redundante é
quase sempre a correção de um caso específico.

Cadeia de modelos: **GPT-4o** extrai · **Gemini 2.5 Flash** escolhe a foto destaque, com
**GPT-4o-mini** como fallback · `ad-cleaner.ts` limpa anúncio de agregador (vaapty/repassey) com
cache de 24h antes de formatar.

### Publicação
`lib/publisher.ts`. A ordem é: checa dedup → presença "composing" → delay aleatório → envia mídia
ou texto → grava em `PostHistory`. Se ao menos um grupo aceitar, o veículo vira `PUBLISHED` e sai
uma entrada de auditoria.

### Formato do anúncio
`lib/vehicle-formatter.ts` é o arquivo mais crítico de regra de negócio. O "padrão Don Felipe" está
escrito **dentro dos prompts de IA e dos comentários** — mudar o formato exige mexer nos dois.

### Banco
Prisma + **PostgreSQL** (dev e prod). 8 models: `User`, `Vehicle`, `MessageTemplate`,
`PostHistory`, `WhatsAppGroup`, `Setting`, `AuditLog`, `MediaFile`.

> Divergências conhecidas do padrão da estrutura base, documentadas de propósito: **não há soft
> delete** e **não há optimistic locking**. Adicionar é mudança de arquitetura — proponha antes.

### Segurança
- Nunca logue telefone, nome de grupo ou conteúdo de mensagem em texto claro.
- Nunca comite `.env`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `UAZAPI_TOKEN`, `WEBHOOK_SECRET` ou
  `HEALTH_MONITOR_SECRET`.
- As rotas `admin/reset-vehicles`, `admin/fix-inflated-prices` e `admin/fix-vehicle-names` são
  destrutivas. Confira a proteção antes de expor ou ampliar.

## 5. Comandos

```bash
pnpm install
pnpm dev              # turbo run dev
pnpm build
pnpm lint
pnpm db:generate
pnpm db:push
pnpm db:seed
pnpm db:studio
```

> [!WARNING]
> **Não há teste automatizado versionado.** `pnpm build` e `pnpm lint` são a única verificação
> automática. Descreva no relatório o que você testou à mão — em especial qualquer mudança que
> toque extração, preço ou publicação.

## 6. Dívidas conhecidas (não são novidade — não "descubra" de novo)

Levantadas no [docs/MAPEAMENTO-PROJETO.md](docs/MAPEAMENTO-PROJETO.md) §10 e conferidas em 31/08:

- **Renomeação em andamento, sem commit.** No git (HEAD) o projeto é **Cugini**; no working tree
  há **173 arquivos modificados** renomeando para **Don Felipe** — feito em 31/08 às 13:06. O
  estado é misto: ~126 ocorrências de "cugini" e ~37 de "don felipe" convivem no código. O roteiro
  da troca é a seção 11 do [docs/MAPEAMENTO-PROJETO.md](docs/MAPEAMENTO-PROJETO.md). **Antes de
  gerar qualquer material com print, decida qual nome vale** — senão o guia sai com os dois.
- **Arquivos gigantes**: `veiculos/page.tsx` com 2.509 linhas e `grupos/page.tsx` com 1.366 —
  ambos violam a regra de 500 linhas.
- **`apps/web/cookies.txt` está versionado.** Hoje ele só tem os comentários de cabeçalho do
  formato netscape, **sem sessão** (verificado). Mas não deveria estar no repositório: da próxima
  vez que alguém rodar um `curl -c`, o token real entra junto.
- **Sem testes.**

## 7. Checklist de saída

- [ ] Quais arquivos foram lidos antes de alterar
- [ ] Quais invariantes da seção 3 a mudança toca
- [ ] Se mexeu em IA ou preço: qual caso real motivou, e o antes/depois de um anúncio
- [ ] Saída de `pnpm build` e `pnpm lint`
- [ ] O que foi testado manualmente, passo a passo
- [ ] Riscos residuais e o que ficou fora do escopo
