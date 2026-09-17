import type { Borda, Rect } from "./tipos";

// ---------------------------------------------------------------------------
// A aritmetica do editor, sem canvas e sem React.
//
// Tudo aqui e funcao pura, entao da pra testar sem navegador. E o pedaco mais
// facil de errar do editor: o canvas trabalha em alta resolucao e a tela mostra
// uma versao escalada, entao toda coordenada precisa ser convertida, e a caixa
// de recorte precisa ser presa dentro da imagem nas oito direcoes.
// ---------------------------------------------------------------------------

/** Lado minimo da caixa de recorte, em pixels do canvas. */
export const LADO_MINIMO = 50;

/** Area de blur abaixo da qual nao se borra: foi um toque, nao um arraste. */
export const SELECAO_MINIMA = 10;

/**
 * Converte um ponto da tela para coordenadas do canvas.
 *
 * O canvas processa em ate 1280x960 e o CSS o mostra menor. Sem esta conversao
 * o operador pinta num lugar e a tinta sai em outro.
 */
export function posicaoNoCanvas(
  medidas: { larguraNaTela: number; alturaNaTela: number; esquerda: number; topo: number },
  tamanho: { width: number; height: number },
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const escalaX = tamanho.width / medidas.larguraNaTela;
  const escalaY = tamanho.height / medidas.alturaNaTela;
  return {
    x: (clientX - medidas.esquerda) * escalaX,
    y: (clientY - medidas.topo) * escalaY,
  };
}

/** O retangulo que o operador desenhou, normalizado pra largura e altura positivas. */
export function retanguloEntre(inicio: { x: number; y: number }, fim: { x: number; y: number }): Rect {
  return {
    x: Math.min(inicio.x, fim.x),
    y: Math.min(inicio.y, fim.y),
    w: Math.abs(fim.x - inicio.x),
    h: Math.abs(fim.y - inicio.y),
  };
}

/**
 * Onde a caixa de recorte vai parar depois de arrastar `dx`/`dy`.
 *
 * `move` desloca a caixa inteira sem mudar o tamanho e para nas paredes da
 * imagem. As demais bordas redimensionam e respeitam o lado minimo, pra caixa
 * nao virar um risco.
 */
export function redimensionarCaixa(
  borda: Borda,
  caixaInicial: Rect,
  dx: number,
  dy: number,
  limites: { width: number; height: number },
): Rect {
  const caixa = { ...caixaInicial };

  if (borda === "move") {
    caixa.x = Math.max(0, Math.min(caixaInicial.x + dx, limites.width - caixaInicial.w));
    caixa.y = Math.max(0, Math.min(caixaInicial.y + dy, limites.height - caixaInicial.h));
    return caixa;
  }

  if (borda === "top" || borda === "top-left" || borda === "top-right") {
    caixa.y = Math.max(0, Math.min(caixaInicial.y + dy, caixaInicial.y + caixaInicial.h - LADO_MINIMO));
    caixa.h = caixaInicial.h - (caixa.y - caixaInicial.y);
  }
  if (borda === "bottom" || borda === "bottom-left" || borda === "bottom-right") {
    caixa.h = Math.max(LADO_MINIMO, Math.min(caixaInicial.h + dy, limites.height - caixaInicial.y));
  }
  if (borda === "left" || borda === "top-left" || borda === "bottom-left") {
    caixa.x = Math.max(0, Math.min(caixaInicial.x + dx, caixaInicial.x + caixaInicial.w - LADO_MINIMO));
    caixa.w = caixaInicial.w - (caixa.x - caixaInicial.x);
  }
  if (borda === "right" || borda === "top-right" || borda === "bottom-right") {
    caixa.w = Math.max(LADO_MINIMO, Math.min(caixaInicial.w + dx, limites.width - caixaInicial.x));
  }

  return caixa;
}

/**
 * A caixa ainda cobre a imagem inteira, com folga de 1%.
 *
 * No card o recorte e aplicado ao soltar a borda: um toque sem querer, que
 * mexe a borda um pixel, nao pode virar recorte.
 */
export function cobreTudo(caixa: Rect, limites: { width: number; height: number }): boolean {
  const folgaX = limites.width * 0.01;
  const folgaY = limites.height * 0.01;
  return caixa.x <= folgaX && caixa.y <= folgaY
    && caixa.x + caixa.w >= limites.width - folgaX
    && caixa.y + caixa.h >= limites.height - folgaY;
}

/**
 * Quanto a imagem precisa encolher pra caber em 1280x960.
 *
 * Nunca aumenta: `1` e o teto. Antes o canvas era 480x360 e foto boa saia
 * pixelada no WhatsApp depois de recortada.
 */
export const LARGURA_MAXIMA = 1280;
export const ALTURA_MAXIMA = 960;

export function escalaParaCaber(largura: number, altura: number): number {
  return Math.min(LARGURA_MAXIMA / largura, ALTURA_MAXIMA / altura, 1);
}

/** O retangulo da caixa de recorte convertido pra pixels de tela. */
export function caixaNaTela(
  caixa: Rect,
  tamanhoDoCanvas: { width: number; height: number },
  tamanhoNaTela: { width: number; height: number },
): Rect {
  const escalaX = tamanhoNaTela.width / tamanhoDoCanvas.width;
  const escalaY = tamanhoNaTela.height / tamanhoDoCanvas.height;
  return {
    x: caixa.x * escalaX,
    y: caixa.y * escalaY,
    w: caixa.w * escalaX,
    h: caixa.h * escalaY,
  };
}
