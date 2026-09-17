#!/usr/bin/env tsx
/**
 * Trava da aritmetica do editor de foto.
 *
 * Esta era a parte mais facil de errar e a mais dificil de ver quebrada: o
 * canvas trabalha em ate 1280x960 enquanto a tela mostra uma versao escalada,
 * entao todo ponto precisa ser convertido, e a caixa de recorte precisa ficar
 * presa dentro da imagem nas oito direcoes.
 *
 * Antes da quebra do photo-editor.tsx nada disso era testavel: a conta morava
 * dentro do componente, no meio de refs de canvas e eventos de ponteiro.
 *
 * Uso: pnpm --filter web exec tsx tests/photo-editor-geometria.test.ts
 */
import assert from "node:assert/strict";
import {
  LADO_MINIMO,
  caixaNaTela,
  cobreTudo,
  escalaParaCaber,
  posicaoNoCanvas,
  redimensionarCaixa,
  retanguloEntre,
} from "../src/components/vehicles/photo-editor/geometria";

const IMAGEM = { width: 1000, height: 800 };

// ── Conversao de coordenadas ──────────────────────────────────────────────
{
  // Canvas de 1000x800 exibido a 500x400: tudo na tela vale o dobro no canvas.
  const medidas = { larguraNaTela: 500, alturaNaTela: 400, esquerda: 100, topo: 50 };

  assert.deepEqual(
    posicaoNoCanvas(medidas, IMAGEM, 100, 50),
    { x: 0, y: 0 },
    "o canto superior esquerdo da tela e a origem do canvas",
  );

  assert.deepEqual(
    posicaoNoCanvas(medidas, IMAGEM, 350, 250),
    { x: 500, y: 400 },
    "o meio da tela e o meio do canvas, ja em escala",
  );
}

// ── Retangulo desenhado em qualquer direcao ───────────────────────────────
{
  const daEsquerda = retanguloEntre({ x: 10, y: 20 }, { x: 60, y: 90 });
  const daDireita = retanguloEntre({ x: 60, y: 90 }, { x: 10, y: 20 });
  assert.deepEqual(daEsquerda, { x: 10, y: 20, w: 50, h: 70 });
  assert.deepEqual(
    daDireita, daEsquerda,
    "arrastar de tras pra frente da o mesmo retangulo, nunca largura negativa",
  );
}

// ── Mover a caixa inteira ─────────────────────────────────────────────────
{
  const caixa = { x: 100, y: 100, w: 400, h: 300 };

  assert.deepEqual(
    redimensionarCaixa("move", caixa, 50, 25, IMAGEM),
    { x: 150, y: 125, w: 400, h: 300 },
    "mover desloca sem mudar o tamanho",
  );

  assert.deepEqual(
    redimensionarCaixa("move", caixa, -9999, -9999, IMAGEM),
    { x: 0, y: 0, w: 400, h: 300 },
    "mover pra fora encosta no canto e para",
  );

  assert.deepEqual(
    redimensionarCaixa("move", caixa, 9999, 9999, IMAGEM),
    { x: 600, y: 500, w: 400, h: 300 },
    "do outro lado, a caixa para rente a borda da imagem",
  );
}

// ── Redimensionar pelas bordas ────────────────────────────────────────────
{
  const caixa = { x: 100, y: 100, w: 400, h: 300 };

  const porBaixo = redimensionarCaixa("bottom", caixa, 0, 100, IMAGEM);
  assert.equal(porBaixo.h, 400, "arrastar a borda de baixo estica a altura");
  assert.equal(porBaixo.y, 100, "e nao mexe no topo");

  const porCima = redimensionarCaixa("top", caixa, 0, 50, IMAGEM);
  assert.deepEqual(
    { y: porCima.y, h: porCima.h },
    { y: 150, h: 250 },
    "arrastar o topo pra baixo encurta a altura na mesma medida",
  );

  const pelaDireita = redimensionarCaixa("right", caixa, 200, 0, IMAGEM);
  assert.equal(pelaDireita.w, 600, "arrastar a direita soma na largura");

  // A partir de x=100 a caixa so pode ter 900 de largura antes de sair da imagem.
  const ateAParede = redimensionarCaixa("right", caixa, 9999, 0, IMAGEM);
  assert.equal(ateAParede.w, 900, "a largura para na borda direita da imagem");

  const peloCanto = redimensionarCaixa("top-left", caixa, 60, 40, IMAGEM);
  assert.deepEqual(
    peloCanto,
    { x: 160, y: 140, w: 340, h: 260 },
    "o canto move os dois lados de uma vez",
  );
}

// ── Os limites que impedem a caixa de virar um risco ──────────────────────
{
  const caixa = { x: 100, y: 100, w: 400, h: 300 };

  const esmagadaPorCima = redimensionarCaixa("top", caixa, 0, 9999, IMAGEM);
  assert.equal(esmagadaPorCima.h, LADO_MINIMO, "o topo nunca passa do lado minimo");

  const esmagadaPorBaixo = redimensionarCaixa("bottom", caixa, 0, -9999, IMAGEM);
  assert.equal(esmagadaPorBaixo.h, LADO_MINIMO, "nem a borda de baixo");

  const esmagadaPelaEsquerda = redimensionarCaixa("left", caixa, 9999, 0, IMAGEM);
  assert.equal(esmagadaPelaEsquerda.w, LADO_MINIMO, "nem a esquerda");

  const esmagadaPelaDireita = redimensionarCaixa("right", caixa, -9999, 0, IMAGEM);
  assert.equal(esmagadaPelaDireita.w, LADO_MINIMO, "nem a direita");

  // Nenhuma direcao pode empurrar a caixa pra fora da imagem.
  const bordas = ["top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"] as const;
  for (const borda of bordas) {
    for (const [dx, dy] of [[9999, 9999], [-9999, -9999], [9999, -9999], [-9999, 9999]]) {
      const r = redimensionarCaixa(borda, caixa, dx, dy, IMAGEM);
      assert.ok(r.x >= 0 && r.y >= 0, `${borda} manteve a caixa dentro pela origem`);
      assert.ok(r.x + r.w <= IMAGEM.width, `${borda} nao passou da largura`);
      assert.ok(r.y + r.h <= IMAGEM.height, `${borda} nao passou da altura`);
      assert.ok(r.w >= LADO_MINIMO && r.h >= LADO_MINIMO, `${borda} respeitou o lado minimo`);
    }
  }
}

// ── Reducao pro teto de resolucao ─────────────────────────────────────────
{
  assert.equal(escalaParaCaber(640, 480), 1, "foto pequena nao e ampliada");
  assert.equal(escalaParaCaber(2560, 1920), 0.5, "foto grande encolhe pra caber em 1280");
  assert.equal(escalaParaCaber(1280, 960), 1, "o tamanho exato do teto passa inteiro");
}

// ── Caixa convertida pra pixels de tela ───────────────────────────────────
{
  assert.deepEqual(
    caixaNaTela({ x: 100, y: 200, w: 400, h: 300 }, { width: 1000, height: 800 }, { width: 500, height: 400 }),
    { x: 50, y: 100, w: 200, h: 150 },
    "a moldura desenhada por cima acompanha a imagem escalada",
  );
}

// ── Recorte ao soltar: so quando a borda andou de verdade ──────────────────
{
  assert.equal(cobreTudo({ x: 0, y: 0, w: 1000, h: 800 }, IMAGEM), true, "caixa inteira nao recorta");
  assert.equal(cobreTudo({ x: 5, y: 3, w: 992, h: 795 }, IMAGEM), true, "tremida de poucos pixels nao recorta");
  assert.equal(cobreTudo({ x: 0, y: 0, w: 1000, h: 700 }, IMAGEM), false, "borda de baixo puxada recorta");
  assert.equal(cobreTudo({ x: 120, y: 0, w: 880, h: 800 }, IMAGEM), false, "borda da esquerda puxada recorta");
}

console.log("OK — geometria do editor de foto travada.");
