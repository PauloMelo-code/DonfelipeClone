# Ativos da marca — Don Felipe Repasses

O montador (`scripts/montar-guia.mjs`) procura estes arquivos em `.tmp_guia/marca/`;
`scripts/preparar-marca.mjs` copia esta pasta para lá.

| Arquivo | Para que | Estado |
| :--- | :--- | :--- |
| `marca.json` | label e tokens da marca | ✅ preenchido |
| `tokens.css` | `--marca` e `--marca-texto` injetados no CSS | ✅ preenchido |
| `logo-negativo.png` | **logotipo OFICIAL do cliente** — só sobre a faixa escura da capa | ✅ oficial |
| `logo-tinta.svg` | — | ❌ **não existe de propósito** |
| `icone.png` | silhueta do carro, recortada do logotipo oficial | ✅ oficial |

Os ativos vêm do **logotipo oficial do cliente** (dourado sobre preto), recortado em 31/08/2026.

> [!IMPORTANT]
> **Esta marca não tem `logo-tinta`.** O logotipo oficial é dourado sobre **fundo preto** — em
> papel branco ele vira uma tarja preta. Em cabeçalho de página branca use
> `{{ICONE}}` + o nome escrito, nunca `{{LOGO_TINTA}}`. O montador aborta se você tentar.

O montador **aborta** de propósito se um placeholder não tem ativo (print faltando viraria um
retângulo escuro que ninguém nota).

> `--marca` (#C9973D) é cor de **preenchimento**. Para texto, filete e número em papel
> branco use `--marca-texto` (#6B4E1A). Confira o contraste antes de confiar:
> abaixo de 4,5:1 contra branco, não serve como texto.
