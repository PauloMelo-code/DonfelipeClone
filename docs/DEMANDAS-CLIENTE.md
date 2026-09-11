---
title: Demandas do Cliente × O que foi Entregue
card: BAH-415
sistema: Don Felipe Repasses (ex-Cugini Repasses)
periodo: 2026-03-11 a 2026-05-27
fonte: histórico de 220 commits + regras registradas no código
gerado_em: 2026-08-31
---

# Demandas do Cliente × O que foi Entregue

Levantamento para retomar a operação com o cliente. Cada demanda abaixo está
reconstruída a partir do que efetivamente entrou no código, com a data em que
foi entregue.

**Legenda:** ✅ entregue · ⚠️ entregue parcialmente · ❌ não feito ·
🔄 cliente mudou de ideia no meio

> **Leia antes:** este documento é reconstruído do repositório. O git registra
> o que **foi feito** — ele não registra pedido que nunca virou código. A
> seção 10 separa o que sabemos com certeza do que precisa vir do cliente.

---

## 1. Formato do anúncio

O tema com mais pedidos — foi refinado de março a maio.

| # | Demanda | Status | Entregue em |
|---|---|---|---|
| 1.1 | Título e preço em negrito no padrão WhatsApp | ✅ | 07/04 |
| 1.2 | Usar o texto original do vendedor como corpo, não as features da IA | ✅ | 09/04 |
| 1.3 | Transmissão abreviada — "(aut.)", "(manual)", "(CVT)" | ✅ | 16/04 |
| 1.4 | Carro híbrido mostra "(híbrido)" no lugar do câmbio | ✅ | — |
| 1.5 | Remover cidade/localização do corpo ("em estoque POA") | ✅ | 16/04 |
| 1.6 | Remover telefone de terceiros e linhas de contato | ✅ | 16/04 |
| 1.7 | Remover linhas de "repasse"/"grupo"/"lista" | ✅ | 16/04 |
| 1.8 | Não puxar "Custo X" nem frases de marketing do vendedor ("Oportunidade", "Imperdível", "Abaixo da tabela") | ✅ | 19/05 |
| 1.9 | Não puxar frases de negociação ("Analiso proposta", "Aceito troca", "Negociável") | ✅ | 19/05 |
| 1.10 | Não repetir o KM no corpo (já está no cabeçalho) | ✅ | 19/05 |
| 1.11 | Anúncio não pode sair vazio quando a limpeza remove tudo | ✅ | 19/05 |
| 1.12 | Sem prefixos com dois-pontos ("Opcionais:", "Estado:", "Placa:") | ✅ | 25/05 |
| 1.13 | Opcionais agrupados, uma informação por linha | ✅ | 25/05 |
| 1.14 | Espaçamento fixo — sem linhas em branco no meio do corpo | ✅ | 25/05 |
| 1.15 | Bloquear a assinatura "CAARPIX" de vazar no anúncio | ✅ | 25/05 |
| 1.16 | **Marca no título** | 🔄 **mudou** | ver abaixo |

### 🔄 1.16 — A marca no título mudou de regra

- **16/04:** pedido foi **tirar** a marca do título ("Land Rover Defender" →
  "Defender"). Implementado.
- **25/05:** pedido foi o **oposto** — marca **sempre** presente ("BMW i7", não
  só "i7"). Implementado, e é a regra que está valendo hoje.

Está no código, em `vehicle-formatter.ts`: *"Cliente quer ver a marca SEMPRE"*.
Vale confirmar com o cliente que essa é mesmo a regra atual.

---

## 2. Filtros de captura (o que entra na fila)

| # | Demanda | Status | Entregue em |
|---|---|---|---|
| 2.1 | Ano mínimo configurável (padrão 2018) | ✅ | 16/04 |
| 2.2 | Preço mínimo configurável (padrão R$ 30.000) | ✅ | 07/04 |
| 2.3 | KM máxima configurável — "km alta perde margem" | ✅ | 23/05 |
| 2.4 | **Desconto mínimo de 10% sobre a FIPE**, auto-rejeitando na captura | ✅ | 19/05 |
| 2.5 | Estados atendidos configuráveis (RS/SC/PR/SP) | ✅ | 18/05 |
| 2.6 | Grupo nacional: sem menção explícita do estado, descarta — *"se não colocar nada, está fora"* | ✅ | 18/05 |
| 2.7 | Ignorar veículo capturado sem foto | ✅ | 07/04 |
| 2.8 | Blocklist de palavras-chave para auto-rejeição | ✅ | — |
| 2.9 | Aprender com rejeições anteriores e auto-rejeitar parecidos | ✅ | — |

### ⚠️ Correção conceitual importante (19/05)

Estava implementado como **"margem mínima de lucro de 9%"**. O conceito certo
era **"desconto mínimo de 10% sobre a tabela FIPE"** — coisas diferentes. Foi
corrigido. Se o cliente ainda falar em "margem mínima", é este o ponto.

---

## 3. Deduplicação

| # | Demanda | Status | Entregue em |
|---|---|---|---|
| 3.1 | Mesmo carro não reposta no mesmo grupo por 2 dias úteis | ✅ | fundação |
| 3.2 | Mesmo carro reposto mais barato substitui o antigo (janela de 30 dias, fica a melhor margem) | ✅ | 23/05 |
| 3.3 | Detectar o mesmo carro com variação leve de escrita (ano ±1, km ±20%, "Onix LT 1.0 Flex" = "Onix LT") | ✅ | 25/05 |
| 3.4 | Detector visual de duplicata (mesma foto) | ✅ | 03/05 |

---

## 4. Grupos, canais e listas

| # | Demanda | Status | Entregue em |
|---|---|---|---|
| 4.1 | Grupos separados em Fonte (captura) e Destino (venda) | ✅ | fundação |
| 4.2 | Tags de região RS/SC/PR/SP/Nacional | ✅ | 13/04 |
| 4.3 | Auto-tagger de região com 80+ nomes conhecidos | ✅ | 13/04 |
| 4.4 | Disparo por região (marca RS → vai pros grupos do RS) | ✅ | 13/04 |
| 4.5 | Adicionar grupo/lista manualmente por número | ✅ | 09/04 |
| 4.6 | Poder deletar qualquer grupo | ✅ | 13/04 |
| 4.7 | Ativar/desativar todos de uma vez | ✅ | 24/03 |
| 4.8 | Busca por nome | ✅ | 24/03 |
| 4.9 | Capturar de **canais e listas de transmissão**, não só grupos | ✅ | 23/05 |
| 4.10 | Capturar de **contato em DM** (mensagem direta) | ✅ | 23/05 |
| 4.11 | Reclassificar manualmente o tipo (grupo/canal/lista/contato) | ✅ | 23/05 |
| 4.12 | Renomear grupo e o nome não ser sobrescrito pelo sync | ✅ | 18/05 |
| 4.13 | Puxar os nomes reais dos contatos | ✅ | 23/05 |
| 4.14 | Botão "Testar envio" para diagnosticar destino | ✅ | 06/05 |
| 4.15 | Verificador de acesso da instância de envio | ✅ | 06/05 |
| 4.16 | Limpar grupos órfãos | ✅ | 23/05 |
| 4.17 | Grupos ativos aparecem primeiro | ✅ | 23/05 |

---

## 5. Publicação e disparo

| # | Demanda | Status | Entregue em |
|---|---|---|---|
| 5.1 | Publicação em lote (vários carros de uma vez) | ✅ | 07/04 |
| 5.2 | Modo "Preparar pra postar depois" + aba Prontos | ✅ | 08/05 |
| 5.3 | Batch por estado | ✅ | 08/05 |
| 5.4 | Reenviar veículo já publicado | ✅ | 07/04 |
| 5.5 | Desmarcar grupos individualmente no modal | ✅ | 03/05 |
| 5.6 | Disparo mais rápido (delays menores) | ✅ | 07/04 e 04/05 |
| 5.7 | Anti-ban: delay aleatório + "digitando" antes de enviar | ✅ | fundação |
| 5.8 | Kill switch — pausar disparo global | ✅ | — |
| 5.9 | Múltiplas fotos por anúncio com seleção manual | ✅ | 08/05 |
| 5.10 | Margem ajustável na hora de publicar | ✅ | fundação |
| 5.11 | Edição de texto persistir ao publicar | ✅ | 23/05 |
| 5.12 | Botão "Regerar com IA" | ✅ | 23/05 |
| 5.13 | Slider de margem regenera o texto | 🔄 **mudou** | ver abaixo |

### 🔄 5.13 — Margem vs. texto editado

Houve uma tentativa de proteger o texto editado manualmente contra a
regeneração pela margem. Foi **revertido** em 07/05: o comportamento esperado
pelo operador é que **mexer na margem regenera o texto inteiro**. Quem quer
texto customizado edita **depois** de fixar a margem.

---

## 6. Editor de fotos

| # | Demanda | Status | Entregue em |
|---|---|---|---|
| 6.1 | Editor com lápis, borracha, blur e recorte | ✅ | 07/04 |
| 6.2 | Blur funcionando em todos os navegadores | ✅ | 16/04 |
| 6.3 | Desfazer por ação (não só "resetar tudo") | ✅ | 16/04 |
| 6.4 | Crop no formato WhatsApp | ✅ | 16/04 |
| 6.5 | Tela cheia no mobile | ✅ | 07/04 |
| 6.6 | Editar foto direto no card | ✅ | 03/05 |
| 6.7 | Deletar foto | ✅ | 16/04 |
| 6.8 | Alerta de placa visível | ✅ | 16/04 |
| 6.9 | Indicador de qualidade da foto | ✅ | 11/05 |
| 6.10 | IA escolher automaticamente a melhor foto de destaque | ✅ | 23/05 |

---

## 7. Qualidade da extração por IA

Concentrou quase todo o trabalho de maio.

| # | Demanda | Status | Entregue em |
|---|---|---|---|
| 7.1 | IA parar de confundir FIPE com preço de venda | ✅ | 18/05 |
| 7.2 | Anúncio com duas FIPEs (0km e usado) → usar a do usado | ✅ | 19/05 |
| 7.3 | Dois preços sem rótulo → maior é FIPE, menor é venda | ✅ | 26/05 |
| 7.4 | Corrigir valores inflados por erro de vírgula ("78.200.00") | ✅ | 23/05 |
| 7.5 | IA parar de confundir KM com potência (CV/HP) | ✅ | 25/05 |
| 7.6 | Auto-corrigir KM e ano errados | ✅ | 25/05 |
| 7.7 | Não usar chamada promocional como modelo ("Menor valor Brasil", "VAAPTY ITAJAÍ") | ✅ | 25/05 |
| 7.8 | Limpar anúncios bagunçados de agregadores (vaapty/repassey) | ✅ | 23/05 |
| 7.9 | Corrigir modelos errados em carros **já capturados** | ✅ | 25/05 |
| 7.10 | Tudo automático — sem precisar clicar em nada | ✅ | 25/05 |
| 7.11 | Não parar se o GPT falhar (fallback Gemini) | ✅ | 25/05 |
| 7.12 | Painel "Análise IA" no card e no modal de detalhes | ✅ | 23/05 |

---

## 8. Telas, relatórios e operação

| # | Demanda | Status | Entregue em |
|---|---|---|---|
| 8.1 | Revisão por gesto (swipe aprova/rejeita) | ✅ | fundação |
| 8.2 | Ver a mensagem original em estilo WhatsApp | ✅ | 09/04 |
| 8.3 | Filtro de período no gráfico (7/14/30 dias) | ✅ | 07/04 |
| 8.4 | Capturas por estado no dashboard | ✅ | 07/05 |
| 8.5 | Ver **todos** os fornecedores ativos, sem corte | ✅ | 23/05 |
| 8.6 | Ranking de motivos de rejeição | ✅ | 11/05 |
| 8.7 | Card de qualidade média com gauge | ✅ | 23/05 |
| 8.8 | Paginação nas listas (20 por página) | ✅ | 16/04 |
| 8.9 | Busca varrer o banco inteiro, não só a página aberta | ✅ | 25/05 |
| 8.10 | Busca sem diferenciar maiúscula/minúscula | ✅ | 25/05 |
| 8.11 | Auditoria com IP e dispositivo de quem agiu | ✅ | 25/05 |
| 8.12 | Ver o anúncio e a análise da IA dentro do log | ✅ | 23/05 |
| 8.13 | Renomear "Auditoria" para "Análise" | ✅ | 27/05 |
| 8.14 | Resetar veículos antigos, mantendo os de hoje | ✅ | 07/05 |
| 8.15 | Limpar veículos sem foto / sem margem | ✅ | 16/04 |
| 8.16 | Marcar veículo como vendido | ✅ | — |
| 8.17 | Gestão de usuários | ✅ | fundação |
| 8.18 | Templates de mensagem | ✅ | fundação |

---

## 9. Mobile, WhatsApp e infraestrutura

| # | Demanda | Status | Entregue em |
|---|---|---|---|
| 9.1 | Refatoração mobile completa (modais fullscreen, bottom nav, touch targets) | ✅ | 13/04 |
| 9.2 | Instalar como app no celular (PWA) | ✅ | 03/05 |
| 9.3 | Conectar WhatsApp por QR Code | ✅ | 07/04 |
| 9.4 | **Dois números** — um captura, outro envia | ✅ | 14/04 |
| 9.5 | Sincronizar grupos das duas instâncias | ✅ | 06/05 |
| 9.6 | Fotos não sumirem depois de um tempo | ✅ | 25/03 |
| 9.7 | Emparelhar foto e texto enviados separadamente | ✅ | 17/04 |
| 9.8 | Álbum de várias fotos do mesmo anúncio | ✅ | 23/05 |
| 9.9 | Revisão de gramática e acentuação da interface | ✅ | 18/05 |
| 9.10 | **Notificações push** | ⚠️ **parcial** | ver seção 10 |
| 9.11 | **Vídeo nos anúncios** | ⚠️ **parcial** | ver seção 10 |

---

## 10. Pendências, entregas parciais e mudanças de rumo

Esta é a seção que interessa para a conversa com o cliente.

### ⚠️ Notificações push — incompleto
A interface pede permissão e o service worker está instalado, mas o
**subscribe real nunca foi ligado** — falta gerar as chaves VAPID. Está
marcado no código como adiado (`push-prompt.tsx`). Hoje funciona notificação
local, com o navegador aberto; **não** chega notificação com o app fechado.
*Esforço para fechar: baixo.*

### ⚠️ Vídeo — só a legenda
Quando chega vídeo, o sistema lê a legenda mas **não baixa nem republica o
vídeo**. Anúncio que só tem vídeo (sem foto) é descartado. Foi uma decisão
consciente de escopo em 16/04. Se o cliente quiser publicar vídeo, é
desenvolvimento novo.

### ❌ Documentação de uso com prints — nunca feita
Existe uma checklist de **37 itens** (`TAREFAS-AMANHA.md`, de 13/04) com o
passo a passo de prints de cada tela para o manual do operador. Nenhum item
foi marcado como concluído. Existe um `Guia-do-Sistema.docx`, mas a checklist
seguiu aberta.

### 🔄 Marca no título — pedido invertido
Ver item 1.16. Tirar a marca (abr) → marca sempre (mai). **Confirmar com o
cliente qual vale.**

### 🔄 Margem regenerando o texto — revertido
Ver item 5.13. Hoje mexer na margem regenera o texto inteiro, por decisão.

### 🗑️ Telegram — construído e removido
Chegou a existir integração com Telegram (03/05) e foi **removida** em 23/05,
junto com um botão de reset perigoso e a seção de Alertas. Se o cliente
lembrar de ter visto Telegram, foi isso.

### ⚠️ Sem testes automatizados
Nenhum teste versionado. Toda validação foi manual. Vale saber ao retomar.

---

## 11. O que este documento **não** consegue responder

O repositório prova o que foi **feito**. Um pedido que nunca virou código não
deixa rastro nenhum no git — some sem registro.

Então, para fechar o BAH-415 de verdade, ainda falta cruzar esta lista com:

1. **As conversas com o cliente** (WhatsApp, reuniões, e-mails) do período de
   março a maio — de onde saem os pedidos que ficaram só no combinado.
2. **A lista do próprio cliente** — como o Douglas colocou no card: mostrar
   este documento serve também *"pra eles também lembrarem"*.

**Sugestão de encaminhamento:** levar esta lista para o cliente como "isto é
o que está no ar hoje" e pedir que apontem o que sentem falta. O que eles
apontarem e não estiver aqui é, por definição, o que ficou para trás.

---

## Resumo em uma linha

De 220 commits, **~90 demandas identificadas e entregues**, **2 entregas
parciais** (push e vídeo), **1 pendência de documentação** (37 prints),
**2 mudanças de rumo** do cliente (marca no título, margem × texto editado) e
**1 funcionalidade removida** (Telegram).
