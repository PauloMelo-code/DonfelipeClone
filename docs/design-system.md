---
title: Design System — Don Felipe Repasses
atualizado: 2026-09-11
fonte_da_verdade: apps/web/src/app/globals.css
---

# Design System — Don Felipe Repasses

Derivado do logotipo oficial: dourado metálico sobre preto. A regra da casa é
que **este documento descreve, o `globals.css` decide**. Se divergirem, vale o
CSS.

---

## 1. Cor

A rampa de dourado foi **amostrada dos pixels da arte do logotipo**, não
escolhida no olho. Todos os tons abaixo foram medidos contra o fundo.

| Token | Hex | Contraste no preto | Uso |
|---|---|---|---|
| `--gold-800` | `#594E21` | — | filete, borda muito discreta |
| `--gold-700` | `#7A5C2E` | — | início do gradiente metálico |
| `--gold-600` | `#9D7144` | 4,88:1 (AA) | só elemento grande, nunca texto pequeno |
| `--gold-500` | `#C9973D` | 7,98:1 (AAA) | **primária** — ação, destaque, foco |
| `--gold-400` | `#D9A157` | 9,19:1 (AAA) | hover |
| `--gold-300` | `#E7C67A` | 12,76:1 (AAA) | texto dourado |
| `--gold-200` | `#F7D097` | 14,42:1 (AAA) | realce do brilho metálico |

### Superfícies

| Token | Hex | Uso |
|---|---|---|
| `--background` | `#000000` | fundo da página |
| `--card` | `#0B0B0C` | cartão |
| `--popover` | `#0E0E10` | modal, menu |
| `--secondary` / `--muted` | `#151517` | campo, área secundária |
| `--border` / `--input` | `#1E1E21` | borda |
| `--sidebar` | `#050506` | barra lateral |
| `--muted-foreground` | `#9A9A9F` | texto de apoio (7,5:1, AAA) |

> **O fundo é preto puro de propósito.** O logotipo tem fundo preto; com o
> antigo `#09090B` aparecia uma emenda visível atrás do PNG no login e na
> barra lateral.

### A regra que não se quebra

**Texto claro sobre dourado é proibido.** Branco sobre `--gold-500` dá
**2,52:1** e reprova em qualquer critério. Preto dá 7,98:1.

Por isso `--primary-foreground` é preto, e a utility `.gradient-gold` **já traz
`color` junto**. Não sobrescreva com `text-white`.

---

## 2. Tipografia

| Papel | Fonte | Onde |
|---|---|---|
| Display | **Cormorant Garamond** 500/600/700 | `h1`, `h2`, `h3` e a classe `.font-display` |
| Corpo | **Inter** | todo o resto, incluindo tabela e formulário |
| Mono | **JetBrains Mono** | código, chave, identificador |

O serifado acompanha o logotipo e para por aí: lista densa de veículo continua
em Inter, que lê melhor.

> **A fonte é declarada no `body`, nunca no `html`.** O `next/font` publica
> `--font-sans` na className do `body`; aplicada no `html` a variável não
> existe e o navegador cai no serifado padrão. Era o que acontecia — o app
> rodou em Times New Roman até 11/09/2026 sem que ninguém percebesse.

---

## 3. Utilities da marca

| Classe | O que faz |
|---|---|
| `.gradient-gold` | preenchimento metálico do logotipo + texto preto garantido |
| `.text-gradient-gold` | mesmo gradiente aplicado ao texto |
| `.glow-gold` / `.glow-gold-sm` | halo dourado |
| `.rule-gold` | filete de 1px que some nas pontas |
| `.font-display` | serifado da marca fora de um heading |
| `.glass` / `.glass-strong` | superfície de vidro **com piso opaco** |

> **Vidro precisa de piso.** Sem uma cor de base, o brilho dourado do fundo
> atravessa o cartão e deixa tudo marrom — foi o que aconteceu no login. O
> reflexo de vidro fica *por cima* de uma superfície definida, nunca no lugar
> dela.

### Botão

Para o CTA principal da marca use a variante pronta, não classes soltas:

```tsx
<Button variant="gold">Publicar</Button>
```

---

## 4. Ativos da marca

Todos gerados a partir da arte oficial (`public/brand/logo-original.jpg`).

| Arquivo | Uso |
|---|---|
| `public/logo-don-felipe.png` | wordmark, **fundo transparente** — login e barra lateral |
| `src/app/icon.png` · `apple-icon.png` | ícone do app (monograma **D**) |
| `public/favicon.ico` | 16/32/48/64 |
| `public/brand/icon-{192,512}.png` · `icon-maskable.png` | PWA |
| `public/brand/silhueta-carro.png` | silhueta, elemento decorativo |

Duas decisões que valem registro:

1. **O ícone é o "D", não o carro.** A silhueta é linha fina de baixo
   contraste: abaixo de 32px vira um borrão marrom. O "D" do wordmark é arte
   do próprio cliente e lê até em 16px.
2. **O wordmark é transparente.** Com fundo preto opaco ele bloqueava a luz
   ambiente da página e desenhava um retângulo mais escuro em volta.

---

## 5. Ícones

A biblioteca é **lucide-react**. Não existe emoji na interface.

| Conceito | Ícone |
|---|---|
| Grupo | `Users` |
| Comunidade | `Building2` |
| Canal | `Radio` |
| Lista de transmissão | `Megaphone` |
| Contato | `User` |
| Nome fixado | `Pin` |
| Score alto | `Flame` |
| VIP | `Star` |
| Sucesso / falha | `Check` / `X` |
| Teclas de atalho | `ArrowLeft` `ArrowRight` `ArrowUp` |

Quando um helper precisa devolver o ícone de um tipo, ele devolve **o
componente**, nunca um glifo — quem renderiza escolhe tamanho e cor. Dentro do
render use `createElement(...)` em vez de atribuir o componente a uma variável
local: a regra `react-hooks/static-components` acusa a atribuição.

> **Três regex de emoji ficam no lugar, de propósito.** Em `lib/ai/regex.ts` e
> `lib/vehicle-formatter.ts` elas **detectam e removem** emoji dos anúncios que
> chegam do vendedor. Apagá-las quebra a extração e deixa emoji vazar para o
> anúncio publicado. O mesmo vale para `scripts/seed/formato.ts`: aquele emoji
> é do anúncio fictício, que imita um anúncio real.
>
> Seta dentro de frase ("WhatsApp → Dispositivos conectados", intervalo de
> data) é tipografia, não ícone disfarçado. Fica.

---

## 6. Ao mexer

- Cor nova entra como token no `:root`, nunca como hex solto no componente.
- Qualquer par texto/fundo novo passa por contraste antes de entrar. Mínimo
  4,5:1 para texto normal.
- Não existe tema claro. O `color-scheme` é `dark` e o produto vive no escuro.
- Não há teste automatizado no repositório: `pnpm build` e `pnpm lint` são a
  rede. Descreva o teste manual no relatório.
