# Workflow — corrigir bug no Don Felipe Repasses

## 1. Ler antes de tocar

- `docs/MAPEAMENTO-PROJETO.md` — 390 linhas cobrindo o sistema inteiro. É a referência; **não duplique**
- `CLAUDE.md` — stack, comandos e regras de negócio em uma página
- `apps/web/src/lib/ai.ts` — o prompt de extração, se for mexer em IA
- `apps/web/src/lib/vehicle-formatter.ts` — o formato do anúncio
- O arquivo real que você vai alterar

## 2. Localizar a camada

| Sintoma | Comece por |
| :--- | :--- |
| Anúncio saiu com o preço da FIPE | `lib/ai.ts` — a regra preço ≠ FIPE e a dos dois valores sem rótulo |
| Valor 100x maior que o real | `lib/vehicle-parser.ts` — o caso do ponto duplo (`78.200.00`) |
| Modelo do carro errado | `lib/ai.ts` — chamada promocional sendo lida como modelo; há validação semântica e fallback Gemini |
| KM absurda | validação cruzada de KM (regex sobrescreve quando o GPT confunde KM com CV/HP) |
| Mesmo carro publicado duas vezes | `lib/deduplication.ts` — match exato e fuzzy, janela de 30 dias |
| Número bloqueado no WhatsApp | anti-ban em `lib/publisher.ts`: composing e delays; confira se alguém usou `quickPublish` em lote |
| Foto destaque ruim | `lib/photo-picker.ts` (Gemini primeiro, GPT-4o-mini de fallback) |
| Anúncio de agregador bagunçado | `lib/ad-cleaner.ts` — cache de 24h antes de formatar |
| Cliente vê "Don Felipe" na tela | renomeação incompleta: 36 ocorrências, incluindo logo, placeholder e subtítulo do dashboard |

## 3. Diagnosticar sem escrever

Reproduza e leia o estado antes de editar. Confira a trilha de auditoria: quem fez, o quê, quando.
Se for escrever script de diagnóstico, ele tem que percorrer **o mesmo caminho do código de
produção** — script que testa por fora mente.

## 4. Corrigir a causa, não o sintoma

Antes de editar, `grep` por **todos os chamadores** da função que você vai tocar. A guarda certa
fica na função compartilhada, não em cada chamador — senão o bug continua vivo nos irmãos.

## 5. Provar

```bash
pnpm lint
pnpm build
```

## 6. Reportar

Sintoma × causa raiz · arquivos lidos e alterados · invariantes tocados · saída dos comandos acima ·
risco residual.
