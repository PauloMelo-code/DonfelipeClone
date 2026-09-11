import { escalaParaCaber } from "./geometria";
import type { Rect } from "./tipos";

// ---------------------------------------------------------------------------
// As operacoes que tocam o canvas.
//
// Todas recebem o contexto de fora e nao sabem nada de React. Ficam juntas
// porque compartilham uma regra: a imagem limpa e guardada em `ImageData` e
// reaplicada antes de cada efeito, pra previa de blur nao empilhar sobre a
// previa anterior.
// ---------------------------------------------------------------------------

/** Qualidade do JPEG entregue ao restante do sistema. */
export const QUALIDADE_JPEG = 0.95;

/** Quanto a area encolhe antes de voltar ao tamanho -- e isso que borra. */
const FATOR_DE_BORRAO = 0.1;

/** Carrega a imagem no canvas, ja reduzida pro teto de resolucao. */
export function carregarNoCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  src: string,
  aoTerminar: (limpa: ImageData) => void,
  aoFalhar: () => void,
) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    const escala = escalaParaCaber(img.width, img.height);
    canvas.width = img.width * escala;
    canvas.height = img.height * escala;
    // Sem isto o redimensionamento sai serrilhado.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    aoTerminar(ctx.getImageData(0, 0, canvas.width, canvas.height));
  };
  img.onerror = aoFalhar;
  img.src = src;
}

/** Um circulo de tinta no ponto, do tamanho do pincel. */
export function pintarPonto(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number },
  cor: string,
  tamanho: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = cor;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, tamanho / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A moldura tracejada azul que mostra a area escolhida antes de aplicar. */
export function desenharSelecao(ctx: CanvasRenderingContext2D, r: Rect) {
  ctx.fillStyle = "rgba(59,130,246,0.15)";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = "#3B82F6";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.setLineDash([]);
}

/**
 * Borra a area encolhendo e reampliando os pixels.
 *
 * Nao usa `ctx.filter`: o suporte varia entre navegadores e o WebView do
 * WhatsApp. Encolher pra 10% e voltar da o mesmo efeito em qualquer lugar.
 */
export function borrarArea(ctx: CanvasRenderingContext2D, r: Rect): boolean {
  const { x, y, w, h } = r;
  const original = document.createElement("canvas");
  original.width = w;
  original.height = h;
  const ctxOriginal = original.getContext("2d");
  if (!ctxOriginal) return false;
  ctxOriginal.putImageData(ctx.getImageData(x, y, w, h), 0, 0);

  const borrado = document.createElement("canvas");
  borrado.width = w;
  borrado.height = h;
  const ctxBorrado = borrado.getContext("2d");
  if (!ctxBorrado) return false;
  ctxBorrado.imageSmoothingEnabled = true;
  ctxBorrado.drawImage(original, 0, 0, w * FATOR_DE_BORRAO, h * FATOR_DE_BORRAO);
  ctxBorrado.drawImage(borrado, 0, 0, w * FATOR_DE_BORRAO, h * FATOR_DE_BORRAO, 0, 0, w, h);

  ctx.drawImage(borrado, x, y);
  return true;
}

/** Corta a imagem na caixa escolhida e encolhe o canvas pro novo tamanho. */
export function recortar(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, caixa: Rect) {
  const recorte = ctx.getImageData(
    Math.round(caixa.x), Math.round(caixa.y), Math.round(caixa.w), Math.round(caixa.h)
  );
  canvas.width = Math.round(caixa.w);
  canvas.height = Math.round(caixa.h);
  ctx.putImageData(recorte, 0, 0);
}

/** Redesenha a imagem a partir de um dataURL, usado ao desfazer. */
export function restaurarDe(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  dataUrl: string,
  aoTerminar: (limpa: ImageData) => void,
) {
  const img = new Image();
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    aoTerminar(ctx.getImageData(0, 0, canvas.width, canvas.height));
  };
  img.src = dataUrl;
}

/** O cursor de circulo que mostra o tamanho do pincel antes de pintar. */
export function cursorDePincel(tamanho: number): string {
  const r = tamanho / 2;
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${tamanho}' height='${tamanho}' viewBox='0 0 ${tamanho} ${tamanho}'%3E%3Ccircle cx='${r}' cy='${r}' r='${r - 1}' fill='none' stroke='white' stroke-width='1.5'/%3E%3C/svg%3E") ${r} ${r}, crosshair`;
}
