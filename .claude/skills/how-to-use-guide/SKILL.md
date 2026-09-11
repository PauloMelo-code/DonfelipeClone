---
name: how-to-use-guide
description: >-
  Cria um guia "como usar" em PDF de um recurso do Don Felipe Repasses (monitoramento e republicação de veículos em grupos de WhatsApp), escrito para quem VAI
  USAR — operador do repasse, dono da operação, suporte interno — com prints reais da aplicação rodando e
  os dados pessoais anonimizados. Use quando o usuário pedir "como usar", "guia do sistema", "explica a tela de veículos", "documenta esse recurso para o cliente",
  "guia do usuário", "manual", "tutorial para o cliente", "passo a passo", "material para mandar no
  WhatsApp", "release notes", ou "das últimas N melhorias faz um como-usar". NÃO use para
  documentação técnica interna (essa é `repo-docs-sync`), para auditoria de dados, nem para
  escrever código.
---

# Guia "Como usar" — Don Felipe Repasses

Produz um PDF de 6 a 10 páginas ensinando alguém a usar um recurso do sistema. O leitor não vai ler
duas vezes: ele quer saber **onde clicar** e **o que vai acontecer**.

> **Nome em inglês, conteúdo em português.** O identificador é `how-to-use-guide` por convenção
> (skill sempre em kebab-case inglês), mas tudo que ela produz é PT-BR. Quem lê é brasileiro.

## 1. Decida a AUDIÊNCIA antes de escrever

| Variante | Leitor | Vocabulário interno | Prints de onde |
| :--- | :--- | :--- | :--- |
| **Operador do repasse** (padrão) | quem revisa o carro capturado, ajusta e publica | ❌ nunca | painel — Veículos, Publicações, Grupos |
| **Dono da operação** | quem acompanha volume, margem e qualidade das capturas | ❌ nunca | Dashboard e Insights |
| **Suporte interno** | nós | ✅ é a linguagem dele | Auditoria, Configurações e as rotas admin |

> [!CAUTION]
> **Variante externa — o que NUNCA entra:** nome de provedor (UAZAPI, OpenAI, Gemini), nome de tabela ou coluna (`identityHash`, `PostHistory`, `Setting`), rota de API, variável de ambiente ou token, nome de arquivo de código, **as rotas `admin/*`** — são destrutivas e não entram em material de cliente, número de telefone e nome de grupo de WhatsApp reais. Se qualquer um desses aparecer no
> rascunho, está errado — isso é documentação interna e mora em `docs/`.
>
> **Regra de ouro:** o operador quer saber **como revisar o carro, corrigir o que a IA errou e publicar sem tomar ban**. Ele não precisa saber qual modelo de IA leu o anúncio.

> [!IMPORTANT]
> **Se o recurso mexe em dinheiro ou em dado que não volta**, a pergunta mais importante é
> **"o que NÃO acontece"**. Neste sistema:
>
> - **o mesmo carro não é republicado por 30 dias** — e entre duplicatas fica a de menor preço;
> - **o sistema espera entre um envio e outro, de propósito** — é o que protege o número de ser bloqueado. Publicação em lote é mais lenta que a rápida por isso, não por lentidão;
> - **preço e FIPE são coisas diferentes** — quando o anúncio só traz a FIPE, o preço fica em branco esperando a revisão;
> - **a margem é configurável** e vale para todos os anúncios.
>
> Confirme cada uma nos docs do projeto antes de escrever — são invariantes do sistema, não opinião.

## 2. Passo 0 — preparar a marca

A marca é única (Don Felipe Repasses) e os ativos vivem em `assets/marca/`:

```bash
node .claude/skills/how-to-use-guide/scripts/preparar-marca.mjs
```

Copia `assets/marca/` para `.tmp_guia/marca/`, que é onde o montador procura. **Leia
`assets/marca/LEIA-ME.md`** — `logo-negativo.svg`, `logo-tinta.svg` e `icone.png` ainda precisam ser
colocados lá na primeira vez. O montador aborta se faltar ativo, de propósito.

> `--marca` é cor de **preenchimento**; para texto, filete e número em papel branco use
> `--marca-texto`. Cor de marca raramente tem contraste suficiente para texto.

> [!CAUTION]
> **Ativo velho em `.tmp_guia/marca/` faz o guia sair com a marca ERRADA, sem erro nenhum.**
> O montador prefere `logo-negativo.svg` a `logo-negativo.png` — então um SVG esquecido de uma
> preparação anterior ganha do PNG oficial e o PDF sai com o logotipo antigo. Aconteceu em
> 31/08/2026. O `preparar-marca.mjs` agora **apaga o destino antes de copiar**; se mexer nesse
> script, não remova essa limpeza.

> [!NOTE]
> **Capa preta nesta marca.** O logotipo oficial é dourado sobre **preto**, e a capa padrão é
> azul-ardósia (`--tinta`) — o retângulo do logotipo aparecia recortado contra o fundo. O token
> `--capa-fundo` (em `assets/marca/tokens.css`) força a capa a `#000000`. Sem esse token, a capa
> volta ao comportamento padrão.

## 3. Passo 1 — levantar o que entra no guia

Pergunte ao usuário quais recursos entram. Se ele disser "as últimas N melhorias", leia
`git log --oneline -n 20` + `git status --short` e **proponha a lista antes de escrever**.

Para cada recurso, responda três perguntas na ótica do leitor:
- Que problema isso resolve **para ele**?
- Onde ele clica?
- O que acontece depois — e, se a ação não tem volta, o que **não** acontece?

## 4. Passo 2 — capturar os prints da aplicação REAL

Nunca desenhe mockup nem descreva a tela de memória.

```bash
node .claude/skills/how-to-use-guide/scripts/capturar-prints.mjs \
  .tmp_guia/perfil-chrome .tmp_guia/prints <email> <senha>
```

Sobe o Chrome headless, faz login **de verdade no formulário**, força tema claro e salva PNG em 2x.
Edite o "roteiro dos prints" no fim do arquivo para o fluxo da vez. `.tmp_guia/prints` é o diretório
que `montar-guia.mjs` procura; o nome de cada PNG é o que você cita em `{{PRINT:nome}}`.

**Seletores reais deste projeto** (verificados no código — confira antes de editar o roteiro):

| Tela | Rota | Campos |
| :--- | :--- | :--- |
| Entrar | `/login` | `#email`, `#password`, botão `type=submit` (NextAuth v4). Credencial de seed local: `admin@donfelipe.com.br` |

Pré-requisito: `pnpm dev` na porta **3000** (rodar em `apps/web`).

> [!IMPORTANT]
> **Já existe um guia feito à mão**: `Cugini-Guia-do-Sistema.docx` (nome e conteúdo ainda na marca antiga) na raiz (2 MB), e o
> `TAREFAS-AMANHA.md` tem uma checklist de "tirar print de cada etapa" que ficou pendente desde
> abril. Use os dois como ponto de partida — o trabalho de decidir o que fotografar já está feito;
> esta skill automatiza a parte de capturar e montar.

> [!CAUTION]
> **A tela de Grupos expõe nomes e IDs de grupos de WhatsApp reais**, e Publicações mostra para onde
> cada anúncio foi. Isso é a operação comercial do cliente. Anonimize com rigor, ou capture com
> grupos de teste.

> [!WARNING]
> **O logo exibido ainda é o antigo.** A renomeação para **Don Felipe Repasses** está completa no
> código (zero ocorrências de "Cugini", build validado), mas `apps/web/public/logo-don-felipe.png`
> e `.avif` — os arquivos que o **login** e a **sidebar** realmente exibem — continuam com a arte da
> marca antiga; só o nome do arquivo mudou.
>
> **Um guia capturado agora sai com o logo errado nessas duas telas.** Substitua os dois arquivos
> pela arte nova antes de capturar. Detalhes na seção 11 do `docs/MAPEAMENTO-PROJETO.md`.

> [!WARNING]
> **Anonimize sempre — e confira PNG a PNG.** O que cada tela expõe:
>
> | Tela | O que expõe |
> | :--- | :--- |
> | `Veículos` | carros capturados com preço, FIPE, km e **as fotos originais do anúncio** |
> | `Publicações` | histórico de envio, com **nome dos grupos de WhatsApp** |
> | `Grupos` | **nomes e IDs de grupos de WhatsApp reais** da operação |
> | `Auditoria` | quem fez o quê, com **IP e dispositivo** |
> | `Insights / Dashboard` | volume, ranking de rejeição e números da operação |
> | `Configurações` | **margem, delays de anti-ban, chaves de integração** |
> | `Usuários` | e-mails da equipe |
> | `Templates` | modelos de mensagem |
>
> O script carrega `scripts/anonimizar.js`, que troca nome/documento/e-mail/telefone/endereço por
> valores fictícios. **Ajuste os nomes fictícios e o `operador` em `anonimizar.js`** para a realidade
> deste projeto antes do primeiro guia — o modelo veio com nomes de outra empresa.

> [!CAUTION]
> **Nunca escreva o JS de anonimização dentro de um template literal.** O template literal processa
> escapes: `\s` vira `s` e `\/` vira `/`, então a função lança em silêncio e os prints saem **sem
> anonimização nenhuma**, com aparência correta. Mantenha o código em `anonimizar.js` e carregue com
> `readFileSync` — é assim que o script já faz.

> [!CAUTION]
> **O banco de desenvolvimento pode ser cópia de produção.** O `capturar-prints.mjs` é **read-only**
> de propósito: o helper `clicar()` recusa botão de ação destrutiva ou de gravação (Salvar, Receber,
> Estornar, Cancelar, Excluir, Importar). Se o guia precisa mostrar uma dessas ações, use um banco
> **local** — não afrouxe a guarda.

## 5. Passo 3 — escrever as páginas

Copie o esqueleto e troque o texto — **não** escreva `<html>`/`<head>`/`<style>`, quem traz isso é o
montador:

```bash
cp .claude/skills/how-to-use-guide/assets/exemplo-paginas.html .tmp_guia/paginas.html
```

Cada página é uma `<section class="pagina">`. Ativos entram por placeholder: `{{LOGO_NEGATIVO}}` (só
na capa escura), `{{LOGO_TINTA}}`, `{{ICONE}}` e `{{PRINT:01-nome}}`.

## 6. Passo 4 — montar e gerar o PDF

```bash
node .claude/skills/how-to-use-guide/scripts/montar-guia.mjs \
  .tmp_guia/paginas.html .tmp_guia/guia.html --titulo "<título do guia>"
```

Injeta os tokens da marca, embute logo e prints em base64 (o PDF tem que ser **um arquivo único**),
grava o título nas propriedades do PDF e diz quantas páginas você escreveu. Placeholder sem ativo
**aborta** de propósito — print faltando viraria um retângulo escuro que ninguém nota. Depois:

```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu \
  --no-pdf-header-footer --print-to-pdf="$HOME/Downloads/DonFelipeRepasses-<Assunto>.pdf" \
  "file://$PWD/.tmp_guia/guia.html"
```

O montador já imprime o comando com o nome certo.

## 7. Passo 5 — verificação obrigatória

1. **Contagem de páginas** bate com o número de `<section class="pagina">`:
   ```bash
   python -c "import re,sys;d=open(sys.argv[1],'rb').read();print(len(re.findall(rb'/Type\s*/Page[^s]',d)))" <pdf>
   ```
   Veio **menos**? Alguma `section` não fechou. **Nunca vem mais** — `.pagina` tem `height:297mm` +
   `overflow:hidden`, então o que estoura é **recortado em silêncio**.
2. **Olhe o resultado — TODAS as páginas.** Renderize e confira; não confie no HTML. A capa é a única
   página sem print — os defeitos moram nas páginas internas.
3. **Varra vazamento — removendo o base64 antes.** Grep direto dá falso positivo (as imagens
   embutidas são megabytes de base64 e contêm qualquer sequência por acaso):
   ```bash
   python -c "
   import re
   h=open('.tmp_guia/guia.html', encoding='utf-8').read()
   h=re.sub(r'data:[a-z/+]+;base64,[A-Za-z0-9+/=]+','IMG',h)
   v=set(re.findall(r'UAZAPI|uazapi|OpenAI|Gemini|identityHash|PostHistory|process\.env|localhost|apps/web|admin/reset',h,re.I))
   print(v or 'nenhum vazamento')"
   ```
4. **Confirme a anonimização print a print.** É o passo que mais falha.
5. **Confirme o título gravado no PDF** — o Chrome grava em duas formas (literal `(...)` quando é
   ASCII puro, hexadecimal UTF-16 quando tem acento), então um `grep` de uma só forma dá falso
   "sem título".

## Referências

### O método — leia antes de escrever o guia

- `references/estrutura-e-tom.md` — estrutura das páginas, tom de voz e frases-modelo
- `references/design-system.md` — tokens, tipografia, geometria da página e por que o papel é branco
- `references/captura-de-prints.md` — captura read-only, login, tema, máscara de valores e anonimização
- `references/marca.md` — as duas armadilhas de branding (logo negativo, contraste)

### Deste projeto

- `docs/MAPEAMENTO-PROJETO.md` — o sistema inteiro — pipeline, motor de IA, publicação e configurações. Leia antes de afirmar o que acontece
- `AGENTS.md` — invariantes e dívidas conhecidas
- `CLAUDE.md` — stack, comandos e regras de negócio em uma página
- `assets/marca/LEIA-ME.md` — ativos da marca e o que ainda falta
- `assets/base.css.html` (CSS do documento) · `assets/exemplo-paginas.html` (esqueleto)
- `scripts/` — `preparar-marca.mjs`, `capturar-prints.mjs` + `anonimizar.js`, `montar-guia.mjs`
