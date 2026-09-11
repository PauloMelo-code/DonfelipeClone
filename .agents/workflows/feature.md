# Workflow — nova funcionalidade no Don Felipe Repasses

## 1. Ler antes de projetar

- `docs/MAPEAMENTO-PROJETO.md` — 390 linhas cobrindo o sistema inteiro. É a referência; **não duplique**
- `CLAUDE.md` — stack, comandos e regras de negócio em uma página
- `apps/web/src/lib/ai.ts` — o prompt de extração, se for mexer em IA
- `apps/web/src/lib/vehicle-formatter.ts` — o formato do anúncio
- O arquivo real que você vai alterar

A funcionalidade pode já existir com outro nome — confira a documentação antes de escrever.

## 2. Decidir onde mora

| Tipo de mudança | Onde |
| :--- | :--- |
| Regra de extração | `apps/web/src/lib/ai.ts` (o prompt) |
| Formato do anúncio | `apps/web/src/lib/vehicle-formatter.ts` — e o "padrão Don Felipe" também está dentro dos prompts |
| Publicação e anti-ban | `apps/web/src/lib/publisher.ts` |
| Deduplicação | `apps/web/src/lib/deduplication.ts` + `business-days.ts` |
| Integração WhatsApp | `apps/web/src/lib/uazapi.ts` |
| Parâmetro ajustável | tabela `Setting` — nunca constante no código |
| Tabela ou coluna | `prisma/schema.prisma` + `pnpm db:push` |
| Tela | `apps/web/src/app/(dashboard)/<rota>/` |
| Tipo compartilhado | `packages/shared/` |

Regra de negócio fica em **um** lugar e é consumida por todas as telas. Se você está copiando a
mesma lógica para um segundo arquivo, pare.

## 3. Implementar respeitando os invariantes

Os da seção "Invariantes" em [../rules/don-felipe-repasses.md](../rules/don-felipe-repasses.md) valem todos. Em especial:

- **Preço ≠ FIPE.** Nunca copiar um para o outro; se a única cifra estiver na linha da FIPE, `price = null`
- **Dois valores sem rótulo**: maior é FIPE, menor é venda — válido só se a diferença ficar entre 3% e 50%
- **Formato brasileiro**: `78.200,00` = 78200 e `78.200.00` (ponto duplo) = 78200, nunca 7.820.000
- **Chamada promocional não é modelo** — "Menor valor Brasil", "VAAPTY ITAJAÍ", "Oportunidade" fazem pular para a segunda linha

## 4. Testar

```bash
pnpm lint
pnpm build
```

## 5. Documentar na mesma alteração

- Módulo, integração ou invariante novo → a doc de arquitetura do projeto
- Invariante que os agentes precisam respeitar → `AGENTS.md` **e** `CLAUDE.md` (os dois)
- Decisão de arquitetura → ADR, se o projeto tiver `docs/adr/`

## 6. Reportar

Arquivos criados/alterados · invariantes tocados · saída dos comandos acima · docs atualizados ·
o que ficou fora do escopo.
