---
title: Mapeamento Completo — Don Felipe Repasses (ex-Cugini)
repo: https://github.com/bahtechprojects/Cugini.git (repositório ainda com o nome antigo)
branch: main
gerado_em: 2026-08-31
periodo_do_projeto: 2026-03-11 a 2026-05-27
commits: 220
arquivos_versionados: 183
linhas_de_codigo_fonte: ~25.000
---

# Mapeamento Completo — Don Felipe Repasses

Documento de handoff. Cobre o que o sistema é, o que foi construído, em que
ordem, e o estado atual após o rebranding para Don Felipe Repasses.

---

## 1. O que o sistema faz

Plataforma que automatiza o ciclo de **repasse de veículos** via WhatsApp:

```
Grupos de repasse (fonte)  →  captura  →  IA extrai dados  →  filtros
        →  fila de revisão humana  →  aprovação  →  margem de lucro
        →  republicação nos grupos de venda (destino)
```

O operador não digita anúncio: o sistema lê a mensagem crua do vendedor,
extrai modelo/ano/km/preço/FIPE, limpa o texto no padrão da casa, aplica a
margem e dispara para dezenas de grupos com proteção anti-ban.

**Diferencial de negócio implementado:** filtros que descartam carro ruim
*antes* de chegar na fila — desconto FIPE mínimo, KM máxima, ano mínimo,
preço mínimo, estado atendido, deduplicação de 30 dias com regra "fica o
mais barato".

---

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Frontend/Backend | Next.js 16 (App Router) + React 19 + TypeScript |
| Estilo | Tailwind v4, shadcn/ui, Tremor, Framer Motion, tema dark preto/cinza/dourado |
| Banco | PostgreSQL via Prisma ORM 6 |
| Auth | NextAuth v4 (JWT) + middleware de rota |
| WhatsApp | UAZAPI (duas instâncias: captura e envio) |
| IA texto | OpenAI `gpt-4.1-mini` (fallback) + regex (primário) |
| IA fallback | Google `gemini-2.5-flash` |
| IA visão | GPT Vision / Gemini Vision (escolha de foto destaque) |
| Deploy | Docker + docker-compose + entrypoint com auto-migration |
| PWA | manifest + service worker + push notifications |

**Estrutura:** `apps/web/` (app inteiro) · `packages/shared/` (tipos) ·
`prisma/` (schema + seed) · raiz (Docker, Turbo, workspace).

---

## 3. Modelo de dados (Prisma)

8 modelos em `prisma/schema.prisma`:

| Modelo | Papel |
|---|---|
| **User** | operadores; role + active; relaciona auditLogs e posts |
| **Vehicle** | entidade central — 45+ campos, 10 índices |
| **WhatsAppGroup** | grupos/canais/listas/contatos; `role` = SOURCE ou TARGET |
| **PostHistory** | cada tentativa de envio (sucesso ou falha), com userId |
| **AuditLog** | trilha de auditoria com IP e User-Agent |
| **Setting** | configurações chave/valor editáveis pela UI |
| **MessageTemplate** | templates de mensagem com atalho |
| **MediaFile** | imagens persistidas em base64 (CDN do WhatsApp expira) |

### Campos-chave do Vehicle

- **Dois hashes:** `vehicleHash` (modelo+ano+km+**preço**, dedup por grupo) e
  `identityHash` (modelo normalizado+ano+km em bucket de 10k, **sem preço** —
  dedup de 30 dias "fica o mais barato").
- **Ciclo de status:** `PENDING → APPROVED → PUBLISHED` / `REJECTED`, com
  timestamps próprios para cada transição.
- **`preparedAt` + `preparedTargetGroupIds`:** modo "preparar pra postar
  depois" (aba Prontos).
- **`photoCategories`:** array paralelo a `photos[]` classificando cada foto
  (exterior/interior/motor/detalhe/screenshot/outro) via GPT Vision.
- **`sourceSenderJid`:** agrupa fotos extras do mesmo anúncio (álbum).
- **`publishingLockedAt`:** lock atômico contra publicação concorrente.
- **`qualityScore`, `isVip`, `autoRejectedReason`, `rejectionTags`,
  `soldAt/soldPrice/soldNotes`, `internalNotes`.**

---

## 4. Pipeline de captura (webhook) — 1.020 linhas

`apps/web/src/app/api/webhook/whatsapp/route.ts` é o coração. Ordem real das
etapas, cada uma com seu motivo de descarte:

1. **Segurança:** `WEBHOOK_SECRET` obrigatório em produção · rate limit ·
   payload máx. (413) · rejeita mensagem própria e chat não suportado.
2. **Lock de processamento:** `already_processing` evita corrida.
3. **Buffer de pareamento:** foto e texto chegam separados no WhatsApp. O
   buffer cobre os três casos — texto-primeiro, foto-primeiro e álbum
   multi-foto (limite 12 fotos), agrupando por JID do remetente.
4. **Pré-filtro grátis:** texto < 20 chars → descarta · sem palavras-chave de
   veículo → descarta. Evita chamar IA à toa.
5. **Cache de extração** (500 entradas, TTL 30 min).
6. **Extração:** regex primeiro (custo zero) → GPT `gpt-4.1-mini` só se o
   regex falhar → Gemini como fallback se o GPT falhar → Vision como último
   recurso.
7. **Validação cruzada:** se o GPT devolveu `km < 1000` e o texto tem CV/HP,
   o regex sobrescreve (o modelo confundia potência com quilometragem).
8. **Filtros de negócio** (todos configuráveis em Settings):
   - ano < `filter_min_year` (padrão 2018)
   - preço < `filter_min_price` (padrão R$ 30.000)
   - km > `filter_max_km` (padrão 300.000)
   - desconto FIPE < `min_fipe_discount` (padrão 10%)
   - sanity check: preço > R$ 2.000.000 → erro de parsing decimal, descarta
   - **grupo Nacional:** exige menção explícita de estado atendido
     (`served_states`, padrão RS,SC,PR,SP). Sem estado = presumido fora.
9. **Deduplicação:** `identityHash` exato → busca **fuzzy** (ano ±1, km ±20%,
   modelo normalizado) → se já existe, fica o de menor preço.
10. **Auto-rejeição:** blocklist de palavras-chave + padrões *aprendidos* de
    rejeições anteriores (`rejection-learning.ts`).
11. **Persistência:** salva Vehicle, persiste as imagens no banco
    (`MediaFile`), calcula `qualityScore`, marca `isVip`, e já gera o
    `formattedAd` limpo + `sellingPrice`.
12. **Pós-processamento assíncrono:** GPT Vision reordena as fotos para que a
    destaque seja do exterior do carro.

---

## 5. Motor de IA

### `lib/ai.ts` (959 linhas)
Prompt de extração com regras explícitas escritas a partir de erros reais em
produção:
- **preço ≠ FIPE** — nunca copiar um pro outro; se a única cifra estiver na
  linha da FIPE, `price = null`
- **duas FIPEs** (0km e usado) → usa a do usado
- **dois valores sem rótulo** → maior = FIPE, menor (geralmente em negrito) =
  venda, válido só se a diferença ficar entre 3% e 50%
- **formato brasileiro:** `78.200,00` = 78200, `78.200.00` (ponto duplo) =
  78200 e não 7.820.000
- **modelo real vs. chamada promocional:** "Menor valor Brasil", "VAAPTY
  ITAJAÍ", "Oportunidade" não são modelo — pula pra segunda linha

### `lib/ad-cleaner.ts`
Limpa anúncios bagunçados de agregadores (vaapty/repassey) via GPT com cache
de 24h antes de formatar.

### `lib/photo-picker.ts`
Classifica cada foto e escolhe a melhor destaque. Gemini 2.5 Flash primeiro,
GPT-4o-mini como fallback.

### `lib/gemini.ts`
Cliente de fallback. Sem `GEMINI_API_KEY` configurada retorna `null` e o
consumidor mantém o texto original.

### `lib/vehicle-formatter.ts` — arquivo mais crítico de regra de negócio
Monta o anúncio no padrão Don Felipe:
```
*MARCA MODELO (aut.)*
2023/2024 | 45.000km

<corpo limpo do anúncio original>

Fipe: 169.302,00
Por: *79.990,00*
```
Filtra do corpo, por regex: emojis, marcadores `*~_`, linhas de preço
("Pedida", "Faço", "Custo", "Tabela", "Sinal", "Entrada", "Pra hoje"),
frases de marketing ("Oportunidade", "Imperdível", "Abaixo da tabela"),
frases de negociação ("Analiso proposta", "Aceito troca", "Negociável"),
telefones, cidades, linhas de repasse/grupo, e repetição de modelo/ano/km que
já estão no cabeçalho. **Regra híbrido:** se `fuel = HIBRIDO`, o rótulo de
câmbio vira "(híbrido)". Se a limpeza esvaziar tudo, cai para as features
extraídas pela IA — o anúncio nunca sai vazio.

---

## 6. Motor de publicação — `lib/publisher.ts`

- **Kill switch global** (`publishing_paused`) checado antes do lote **e**
  antes de cada grupo.
- Só publica veículo `APPROVED`.
- Por grupo: dedup (2 dias úteis via `business-days.ts`) → presença
  "digitando" → delay aleatório → envia foto+legenda ou texto → registra em
  `PostHistory`.
- **Dois perfis de delay:** quick publish 0,3–1s (botão único do admin) e
  batch 1–3s configurável (anti-ban).
- Resolve `/api/media/[id]` → data URI base64 antes de mandar pra UAZAPI.
- Auto-extrai FIPE do `rawDescription` se estiver faltando.
- Falha em 1 grupo não aborta os outros; status vira `PUBLISHED` se pelo menos
  um grupo aceitou.
- Log de auditoria com contagem de sucesso/falha/pulado por grupo.

---

## 7. Superfície da aplicação

### 9 telas
Dashboard · Veículos (2.509 linhas — a maior) · Publicações · Insights ·
Grupos (1.366 linhas) · Templates · Usuários · Análise (ex-Auditoria) ·
Configurações. Mais login e um layout com sidebar desktop + bottom nav mobile.

### ~55 rotas de API
Agrupadas por domínio:

- **vehicles/** — approve, reject, publish, publish-direct, republish, prepare,
  batch-publish, batch-publish-prepared, regenerate-ad, backfill-fipe,
  delete-photo, mark-sold, undo, similar, insights, cleanup
- **groups/** — sync, stats, auto-region, repair-names, resolve-names,
  cleanup-orphans, fix-classification, test-send, verify-send-membership
- **whatsapp/** — qr, status, send-qr, send-status, health-monitor
- **admin/** — fix-inflated-prices, fix-vehicle-names, reset-vehicles,
  uazapi-debug
- **dashboard/** — chart, captures-by-state, rejections-ranking
- outros — webhook/whatsapp, publish, publications, settings, users, templates,
  audit-logs, insights, search, media/[id], health, publishing/pause

### Componentes notáveis
`photo-editor.tsx` (706 linhas — lápis, borracha, blur, recorte, fullscreen
mobile) · `swipe-stack.tsx` (580 linhas — aprovar/rejeitar por gesto) ·
`ai-insights.tsx` · `audit-vehicle-detail.tsx` · `global-search.tsx` ·
`error-boundary.tsx` · biblioteca UI própria com ~25 componentes.

---

## 8. Configurações editáveis (tabela Setting)

| Chave | Padrão | Efeito |
|---|---|---|
| `profit_margin_percent` | 10 | margem aplicada no preço de venda |
| `delay_min_seconds` / `delay_max_seconds` | 5 / 15 | anti-ban entre envios |
| `filter_min_year` | 2018 | descarta carro mais velho |
| `filter_min_price` | 30000 | descarta carro barato demais |
| `filter_max_km` | 300000 | descarta km alta |
| `min_fipe_discount` | 10 | desconto mínimo sobre a FIPE |
| `served_states` | RS,SC,PR,SP | estados atendidos (grupo Nacional) |
| `blocklist_keywords` | — | auto-rejeição por palavra-chave |
| `vip_keywords` | — | soma à lista VIP padrão |
| `publishing_paused` | false | kill switch global de disparo |

**Lista VIP embutida** (`lib/vip-detection.ts`): Land Rover, Defender, Range
Rover, Porsche, BMW M, AMG, Audi RS, Land Cruiser, Ferrari, Lamborghini,
Maserati, Tesla.

**Score de qualidade** (`lib/quality-score.ts`), 0–10: km, idade, desconto
FIPE, e bandeiras de risco no texto (leilão/sinistro/batido/enchente = −5;
único dono e revisado = +1 cada).

---

## 9. Linha do tempo — o que foi feito, por fase

**220 commits · 38 em março · 75 em abril · 107 em maio.**

### Fase 1 — Fundação e deploy (11–15/mar, 38 commits)
Plataforma completa criada de uma vez. Todo o resto do mês foi domar o Docker:
lazy init dos clientes OpenAI/UAZAPI para não quebrar no build, entrypoint com
auto-migration, seed pré-compilado, permissões do `.prisma` e `.next/cache`,
tipos do Recharts.

### Fase 2 — Integração real com a UAZAPI (24–25/mar)
A fase mais dolorosa. O payload real da UAZAPI não batia com o esperado: os
campos estavam dentro do objeto `chat`, não na raiz. Reescrita do parsing,
`stanzaID` correto, `/message/download` para baixar imagens, conversão para
base64 antes do GPT-4o, correção de mimeType, e a decisão de **persistir as
imagens no banco** porque a URL do CDN do WhatsApp expira. Nasceram também o
álbum bidirecional com fotos órfãs e o filtro por estado.

### Fase 3 — Produção e mobile (07–17/abr, 75 commits)
- **Auditoria pré-produção:** `fipePrice` salvo no webhook (estava sendo
  descartado), `sellerPhone` vindo da IA em vez do pushName, índice em
  `sourceMessageId`, webhook secret obrigatório, delay entre veículos no lote,
  `JSON.parse` com try-catch, download de imagem limitado a 10 MB / 5 redirects.
- **Refatoração mobile completa:** modais fullscreen no mobile e popup no
  desktop, bottom nav substituindo hamburger, tabs Fonte/Destino, cards com CSS
  grid para truncar nomes com emoji, scroll interno na lista de grupos, editor
  de foto fullscreen, textarea 50vh.
- **Grupos por região** (RS/SC/PR/SP/Nacional) com auto-tagger de 80+ nomes
  conhecidos, filtros e disparo por região.
- **Corte de custo de ~90%:** GPT-4o → GPT-4o-mini, cache de extração,
  pré-filtro regex, `detail: low` nas imagens, e a inversão da estratégia —
  **regex vira o método primário, GPT só fallback**.
- Editor de foto, conexão por QR Code, dois números WhatsApp (captura e envio
  separados), backfill de FIPE, publicação em lote, PWA + push.

### Fase 4 — Regras de negócio afinadas (18–19/mai)
Rodada de correções vindas do uso real:
- desconto **mínimo da FIPE de 10%** (era margem mínima — conceito estava
  errado), com auto-rejeição na captura
- anúncio com duas FIPEs (0km e usado) → pega a do usado
- grupo nacional descarta carro sem menção explícita do estado
- anúncio parou de puxar "Custo X", frases de marketing e frases de
  negociação do vendedor; parou de repetir o KM no corpo; e ganhou proteção
  contra sair vazio
- renomear grupo manualmente trava o nome contra o sync (`nameLocked`)
- revisão de gramática e acentuação em toda a UI

### Fase 5 — Canais, contatos e UX (23/mai, 26 commits em um dia)
- sync passa a capturar **canais e listas de transmissão** além de grupos;
  classificação por sufixo de JID com override manual (`kindOverride`)
- captura de veículos vindos de **DM de contatos** (`@s.whatsapp.net`)
- endpoint de diagnóstico `/api/admin/uazapi-debug`, limpeza de grupos órfãos,
  reparo de nomes
- **quick wins visuais:** componentes reutilizáveis, refactor de 6 telas, login
  premium, paginação e ordenação
- IA limpa anúncios de agregadores; GPT Vision escolhe a foto destaque; painel
  "Análise IA" migra do modal de publicar para o de detalhes
- KM máxima configurável; dedup de 30 dias com regra "fica o mais barato"
- limpeza: remove Telegram, botão de reset perigoso e seção de Alertas

### Fase 6 — Qualidade da extração (25–27/mai, últimos commits)
O trabalho mais recente foi todo sobre **confiabilidade da IA**:

| Data | Entrega |
|---|---|
| 25/05 | nome do carro + opcionais agrupados no padrão Don Felipe |
| 25/05 | padrão sem prefixos com dois-pontos; bloqueia "CAARPIX" |
| 25/05 | espaçamento padrão — sem linhas em branco no corpo |
| 25/05 | ferramenta admin: corrigir modelos errados em carros já capturados |
| 25/05 | **tudo automático** — IA limpa e corrige sem clicar em nada |
| 25/05 | fallback Gemini se o GPT falhar |
| 25/05 | validação semântica do modelo + Gemini Vision como fallback de foto |
| 25/05 | GPT parou de confundir KM com CV; trata EXCLUSIVIDADE e variantes |
| 25/05 | marca **sempre** no anúncio; upgrade para Gemini 2.5 Flash |
| 25/05 | auto-fix de KM/ano errados; marca duplicada no header |
| 25/05 | validação cruzada de KM — regex sobrescreve o GPT |
| 25/05 | busca server-side em veículos (procura o DB inteiro, não a página) |
| 25/05 | auditoria com IP + dispositivo; expansão em publicações |
| 25/05 | **dedup fuzzy** — detecta o mesmo carro com variações leves |
| 25/05 | busca case-insensitive em todas as telas |
| 26/05 | inferir FIPE quando o anúncio traz 2 preços sem rótulo |
| 26/05 | força re-extração quando FIPE é null e há 2 valores no texto |
| **27/05** | **último commit:** Auditoria renomeada para **Análise** + expansão inline na tabela |

---

## 10. Estado atual

**Onde parou:** o sistema está funcional e em produção. Os últimos dois meses
foram refinamento de extração, não construção de features novas — sinal de
maturidade. O último commit é uma mudança puramente de UI.

**Pontos de atenção herdados:**
- `veiculos/page.tsx` com 2.509 linhas e `grupos/page.tsx` com 1.366 violam a
  regra de 500 linhas do `CLAUDE.md` — candidatos a split.
- Nenhum teste automatizado versionado.
- `TAREFAS-AMANHA.md` (13/abr) tem uma checklist de prints de documentação que
  ficou pendente.
- `apps/web/cookies.txt` está versionado — verificar se contém sessão real
  antes de publicar em qualquer lugar.
- Existe um `Don Felipe-Guia-do-Sistema.docx` (2 MB) na raiz, guia do usuário final.

---

## 11. Rebranding para Don Felipe Repasses — executado (BAH-416)

A troca de marca foi aplicada em todo o código. **Zero ocorrências de
"Cugini" ou "orange" restantes** nos fontes. Build de produção validado.

### Nova paleta

| Token | Antes (laranja) | Agora (dourado) |
|---|---|---|
| principal | `#E8731A` | `#C9973D` |
| claro | `#FF8C2E` | `#E7C67A` |
| suave | `rgba(232,115,26,·)` | `rgba(201,151,61,·)` |

O token Tailwind `cugini-orange` virou **`brand-gold`** — nome neutro de
marca, para que um próximo rebranding não exija nova varredura. As utilities
`glow-orange`/`gradient-orange`/`text-gradient-orange` viraram
`glow-gold`/`gradient-gold`/`text-gradient-gold` (26 usos atualizados).

### O que mudou

| Área | Mudança |
|---|---|
| Tema | `globals.css` — variáveis, `--primary`, `--ring`, `--chart-1`, sidebar, utilities |
| Identidade | `package.json` (`donfelipe`), `@donfelipe/shared`, `manifest.json`, `layout.tsx`, `sw.js` |
| Logo | `logo-cugini.*` → `logo-don-felipe.*`; SVG redesenhado (dourado + "RS \| SC \| PR"); `icon.svg` e `favicon.svg` recoloridos |
| Seed | login agora é `admin@donfelipe.com.br`; grupos demo renomeados |
| Docker | containers `don-felipe-postgres` / `don-felipe-redis`; `POSTGRES_USER/DB` → `donfelipe` |
| Prompts de IA | "padrão Cugini" → "padrão Don Felipe" em `ad-cleaner.ts` |
| Mensagens | teste de envio, backfill FIPE, push, preview do anúncio |
| localStorage | `cugini_*` → `donfelipe_*` |

### ⚠️ Pendências do rebranding

1. ~~**`logo-don-felipe.png` e `.avif` ainda são a arte antiga.**~~ **RESOLVIDO
   em 31/08/2026:** o logotipo oficial do cliente foi recortado e aplicado nos
   dois arquivos, que são os exibidos no **login** e na **sidebar**.

2. **`docker-compose.yml` mudou `POSTGRES_USER` e `POSTGRES_DB`.** Se o
   volume do Postgres em produção for reaproveitado, o banco vai subir
   **vazio** — o volume antigo tem o usuário/base `cugini`. Ou se cria volume
   novo, ou se renomeia usuário e base no banco existente antes de subir.

3. **`.env` de produção** não está versionado: conferir `DATABASE_URL` para
   bater com o usuário/base novos.

### Ainda com o nome antigo (fora do código)

- O repositório no GitHub: `bahtechprojects/Cugini.git`
- A pasta local: `C:\Users\Paulo\Desktop\Cugini`
- O arquivo `Cugini-Guia-do-Sistema.docx` (guia do usuário final, 2 MB) — o
  conteúdo interno tem a marca antiga e precisa ser refeito ou editado à mão.
