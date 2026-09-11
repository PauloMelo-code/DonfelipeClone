---
title: Tarefas para Amanha - Don Felipe Repasses
date: 2026-04-13
tags:
  - donfelipe
  - tarefas
  - producao
---

# Tarefas para Amanha

## 1. Tirar Print de Cada Etapa (Passo a Passo do Uso)

### Prints Necessarios

#### A. Login
- [ ] Tela de login (email + senha)
- [ ] Dashboard apos login (visao geral)

#### B. Configuracao Inicial
- [ ] Configuracoes > Celular de Captura (QR Code)
- [ ] Configuracoes > Margem de lucro
- [ ] Configuracoes > Anti-Ban (delays)
- [ ] Configuracoes > Filtros padrao (ano minimo, preco minimo)
- [ ] Configuracoes > Ferramentas (botao Atualizar FIPE + Auto-tagger)

#### C. Grupos
- [ ] Pagina de Grupos — tab Destino
- [ ] Pagina de Grupos — tab Fonte
- [ ] Grupo com regiao selecionada (chip laranja RS/SC/PR)
- [ ] Modal "Adicionar manual"
- [ ] Filtro por regiao (chip SC selecionado filtrando)
- [ ] Botao Sincronizar UAZAPI

#### D. Revisao de Veiculos (Pendentes)
- [ ] SwipeStack — card com foto, dados, preco, FIPE, descricao verde
- [ ] Gesto de swipe direita (overlay verde "Aprovar")
- [ ] Gesto de swipe esquerda (overlay vermelho "Rejeitar")
- [ ] Modal de rejeicao (motivo opcional)
- [ ] Filtros: RS, SC, PR, SP, faixa de preco, transmissao

#### E. Publicar Veiculo (Individual)
- [ ] Aba "Editar Foto" — thumbnail + botao tela cheia (mobile)
- [ ] Editor de foto fullscreen (blur, recortar, lapis, borracha)
- [ ] Aba "Editar Texto" — textarea com anuncio formatado
- [ ] Aba "Preview" — antes/depois no estilo WhatsApp
- [ ] Secao "Enviar para" — regioes colapsaveis (RS, SC, PR)
- [ ] Margem configuravel + preco de venda calculado
- [ ] Botao "Confirmar e publicar (X grupos)"

#### F. Publicar em Lote
- [ ] Aba Aprovados com checkboxes nos cards
- [ ] Botao "Selecionar todos"
- [ ] Barra fixa inferior "X veiculos selecionados — Publicar em lote"
- [ ] Modal de lote com selecao de regioes
- [ ] Progresso do envio

#### G. Publicacoes
- [ ] Lista de publicacoes (mobile cards)
- [ ] Filtro: Todas / Sucesso / Falhas
- [ ] Card mostrando veiculo + grupo + status

#### H. Auditoria
- [ ] Lista de logs com filtros (Capturado, Aprovado, Rejeitado, Publicado)
- [ ] Log expandido mostrando detalhes

#### I. Usuarios
- [ ] Lista de usuarios
- [ ] Modal criar/editar usuario

---

## 2. Revisar Fila de Disparo (Como Funciona)

### Fluxo Completo de Disparo

```
Mensagem no WhatsApp (grupo fonte)
        |
        v
   [WEBHOOK] recebe payload da UAZAPI
        |
        v
   [PRE-FILTRO] texto < 20 chars? sem keywords? → descarta
        |
        v
   [CACHE] texto ja processado? → retorna resultado salvo
        |
        v
   [AI GPT-4o-mini] extrai: modelo, ano, km, preco, FIPE, features
        |
        v
   [FILTROS] ano < minimo? preco < minimo? → descarta
        |
        v
   [DEDUP] hash (modelo+ano+km+preco) ja existe? → descarta
        |
        v
   [SALVA] Vehicle status=PENDING no banco
        |
        v
   [REVISAO HUMANA] operador ve no SwipeStack
        |
   Aprovar ──────────── Rejeitar
        |                    |
        v                    v
   status=APPROVED      status=REJECTED
   formattedAd gerado   motivo salvo
   FIPE auto-extraido
        |
        v
   [PUBLICAR] operador seleciona grupos por regiao
        |
        v
   Para cada grupo destino:
     1. Verifica dedup (2 dias uteis)
     2. Envia presenca "digitando..."
     3. Delay aleatorio (5-15s)
     4. Envia foto + texto formatado
     5. Registra no PostHistory
        |
        v
   status=PUBLISHED
```

### Disparo em Massa (Batch)

```
Operador seleciona N veiculos aprovados
        |
        v
Clica "Publicar em lote"
        |
        v
Seleciona regioes (RS, SC, PR)
        |
        v
Para cada veiculo (sequencial):
  |
  v
  publishVehicle(id, targetGroupIds)
  |
  ├── Para cada grupo da regiao:
  |     ├── Dedup check (2 dias uteis)
  |     ├── Composing presence
  |     ├── Delay 5-15s (configuravel)
  |     ├── Envia mensagem
  |     └── Registra post
  |
  ├── Delay 3-8s antes do proximo veiculo (anti-ban)
  |
  └── Se 1 grupo falha → continua nos outros
        |
        v
Resultado: "X de Y veiculos publicados"
```

### Protecoes Anti-Ban
- Delay aleatorio entre 5-15s por grupo (configuravel)
- Delay 3-8s entre veiculos no batch
- Presenca "composing" antes de cada envio
- Deduplicacao: mesmo carro nao reposta no mesmo grupo por 2 dias uteis

### Pontos de Atencao para Producao
- Se UAZAPI cair, mensagens ficam em APPROVED (nao perde dados)
- Se 1 grupo falhar no meio do envio, os outros continuam
- Veiculo so muda para PUBLISHED se pelo menos 1 grupo teve sucesso
- WEBHOOK_SECRET obrigatorio em producao (rejeita se nao configurado)
- Imagens limitadas a 10MB + max 5 redirects

---

## 3. Resumo de Tudo que Foi Feito Hoje

### Features Novas
- Grupos por regiao (RS/SC/PR/SP/Nacional) com tags e filtros
- Disparo por regiao (seleciona RS → envia para 40 grupos de uma vez)
- Disparo em lote (seleciona 10 carros → publica tudo sequencial)
- Formato de anuncio Don Felipe (titulo bold, descricao limpa, FIPE, preco bold)
- Auto-extrator de FIPE (regex no rawDescription)
- Auto-tagger de regiao (80+ nomes mapeados)
- Editor de foto (lapis, borracha, blur, recorte) com fullscreen mobile
- Conexao WhatsApp via QR Code
- Adicionar grupo manualmente por numero
- Deletar qualquer grupo
- Backfill FIPE + regenerar anuncios

### Otimizacoes
- GPT-4o → GPT-4o-mini (custo ~90% menor)
- Cache de extracao AI (evita duplicatas)
- Pre-filtro regex (pula mensagens sem keywords de veiculo)
- detail: low nas imagens (menos tokens)
- Caption > 30 chars → extrai do texto sem visao

### Correcoes (Auditoria Senior)
- fipePrice salvo no webhook (era descartado)
- sellerPhone usa telefone da AI (era pushName)
- Index no sourceMessageId (performance)
- Webhook secret obrigatorio em producao
- Delay entre veiculos no batch (anti-ban)
- JSON.parse(filters) com try-catch
- rawDescription sanitizado (* removido)
- Image download limitado 10MB + 5 redirects
- Lista atualiza apos publicar

### Mobile
- Modais fullscreen no mobile, popup centrado no desktop
- Tabs Fonte/Destino no mobile (sem rolar 90 grupos)
- Cards de grupo com CSS grid (trunca nomes com emoji)
- Lista de grupos com scroll interno
- Filtros wrap em 2 linhas
- SwipeStack com descricao max-h-[30vh]
- Editor de foto: thumbnail + botao fullscreen no mobile
- "Enviar para" collapsible no mobile
- Publicacoes com cards maiores
- Textarea 50vh no mobile
