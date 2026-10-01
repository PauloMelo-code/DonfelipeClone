#!/usr/bin/env tsx
/**
 * Cliente, 30/09/2026: "esta vindo muitos anuncios com fotos erradas" -- um
 * HB20S com as fotos de um HR-V.
 *
 * O vendedor manda o TEXTO primeiro e depois as fotos. So a primeira casava
 * com o texto; as outras ficavam esperando legenda e iam parar no PROXIMO
 * anuncio do mesmo vendedor.
 *
 * Uso: pnpm --filter web exec tsx tests/pareamento.test.ts
 */
import assert from "node:assert/strict";
import { parear, fotosQueChegaramDepois } from "../src/lib/webhook/parear";

let falhas = 0;
function caso(nome: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`FALHOU ${nome}\n       ${(e as Error).message.split("\n").join("\n       ")}`);
  }
}

let n = 0;
const msg = (grupo: string, texto: string | null, foto: string | null) =>
  parear({ groupJid: grupo, senderJid: "5547999990000@s.whatsapp.net", messageId: `m${++n}`, textContent: texto, imageUrl: foto });

caso("texto primeiro: as fotos seguintes sao do mesmo carro, nao do proximo", () => {
  const G = "g1@g.us";
  assert.equal(msg(G, "HR-V EXL 2018 automatico", null).tipo, "bufferado");
  const hrv = msg(G, null, "hrv-1");
  assert.equal(hrv.tipo, "segue");
  if (hrv.tipo === "segue") assert.equal(hrv.imageUrl, "hrv-1");

  // Chegam enquanto o HR-V ainda esta sendo gravado.
  assert.equal(msg(G, null, "hrv-2").tipo, "bufferado");
  assert.equal(msg(G, null, "hrv-3").tipo, "bufferado");
  assert.deepEqual(fotosQueChegaramDepois(G, "5547999990000@s.whatsapp.net", "v-hrv"), ["hrv-2", "hrv-3"]);

  // Depois de gravado, a foto vai direto pro album do HR-V.
  const tardia = msg(G, null, "hrv-4");
  assert.equal(tardia.tipo, "segue");
  if (tardia.tipo === "segue") {
    assert.equal(tardia.textContent, null, "sem texto: a rota anexa ao album");
    assert.equal(tardia.veiculoDoAlbum, "v-hrv", "e ao carro CERTO, sem procurar");
  }

  // O proximo anuncio comeca do zero -- com a SUA foto.
  assert.equal(msg(G, "HB20S Premium 1.6 2018", null).tipo, "bufferado");
  const hb = msg(G, null, "hb20-1");
  assert.equal(hb.tipo, "segue");
  if (hb.tipo === "segue") {
    assert.equal(hb.imageUrl, "hb20-1");
    assert.equal(hb.textContent, "HB20S Premium 1.6 2018");
  }
});

caso("foto primeiro: todas as fotos vao com o texto, e o proximo carro espera as dele", () => {
  const G = "g2@g.us";
  assert.equal(msg(G, null, "a-1").tipo, "bufferado");
  assert.equal(msg(G, null, "a-2").tipo, "bufferado");
  const a = msg(G, "Onix LT 2020 50.000km", null);
  assert.equal(a.tipo, "segue");
  if (a.tipo === "segue") assert.deepEqual([a.imageUrl, ...a.fotosExtras], ["a-1", "a-2"]);

  // Quem posta foto primeiro: a foto seguinte e do proximo carro.
  assert.equal(msg(G, null, "b-1").tipo, "bufferado");
  const b = msg(G, "Gol 2015 90.000km", null);
  if (b.tipo === "segue") assert.equal(b.imageUrl, "b-1");
  else assert.fail("o Gol devia sair com a foto dele");
});

caso("carro que nao foi gravado: as fotos dele nao passam pro proximo", () => {
  const G = "g3@g.us";
  msg(G, "Texto que a esteira vai descartar", null);
  msg(G, null, "x-1"); // casou, mas o carro nunca foi gravado
  assert.equal(msg(G, null, "x-2").tipo, "bufferado");
  msg(G, "Corolla XEI 2023 60.000km", null);
  const c = msg(G, null, "corolla-1");
  if (c.tipo === "segue") assert.equal(c.imageUrl, "corolla-1");
  else assert.fail("o Corolla devia sair com a foto dele");
});

// ── Cliente, 01/10/2026: "puxou um Corolla e trouxe a imagem de uma SW4" ──
const relogio = Date.now;
const daquiA = (min: number) => { const real = relogio(); Date.now = () => real + min * 60_000; };
const SW = "5547988887777@s.whatsapp.net";
const de = (grupo: string, texto: string | null, foto: string | null) =>
  parear({ groupJid: grupo, senderJid: SW, messageId: `s${++n}`, textContent: texto, imageUrl: foto });

caso("foto COM legenda e depois fotos sem legenda: tudo do mesmo carro", () => {
  const G = "g4@g.us";
  const sw4 = de(G, "SW4 SRX 2.8 2021 80.000km", "sw4-1");
  assert.equal(sw4.tipo, "segue");
  assert.equal(de(G, null, "sw4-2").tipo, "bufferado", "espera o carro ser gravado");
  assert.deepEqual(fotosQueChegaramDepois(G, SW, "v-sw4"), ["sw4-2"]);
  const extra = de(G, null, "sw4-3");
  if (extra.tipo === "segue") assert.equal(extra.veiculoDoAlbum, "v-sw4");
  else assert.fail("a foto extra devia ir pro album da SW4");

  // O Corolla do mesmo vendedor, texto antes da foto: sai com a foto DELE.
  assert.equal(de(G, "Corolla XEI 2.0 2022 50.000km", null).tipo, "bufferado");
  const corolla = de(G, null, "corolla-1");
  if (corolla.tipo === "segue") {
    assert.equal(corolla.imageUrl, "corolla-1");
    assert.deepEqual(corolla.fotosExtras, []);
  } else assert.fail("o Corolla devia sair com a foto dele");
});

caso("legenda na ULTIMA foto do album: as de antes vao junto", () => {
  const G = "g5@g.us";
  de(G, null, "a-1");
  de(G, null, "a-2");
  const r = de(G, "Hilux SRV 2019 90.000km", "a-3");
  if (r.tipo === "segue") assert.deepEqual([r.imageUrl, ...r.fotosExtras], ["a-3", "a-1", "a-2"]);
  else assert.fail("o anuncio devia sair");
});

caso("album vence em 2 min: foto depois disso e do proximo carro", () => {
  const G = "g6@g.us";
  try {
    de(G, "Compass 2020 60.000km", "c-1");
    fotosQueChegaramDepois(G, SW, "v-compass");
    daquiA(3);
    assert.equal(de(G, null, "proximo-1").tipo, "bufferado", "nao entra no Compass");
    const prox = de(G, "Renegade 2019 70.000km", null);
    if (prox.tipo === "segue") assert.equal(prox.imageUrl, "proximo-1");
    else assert.fail("o Renegade devia sair com a foto dele");
  } finally {
    Date.now = relogio;
  }
});

caso("foto velha nao se renova: nao chega num carro de muito depois", () => {
  const G = "g7@g.us";
  try {
    de(G, null, "velha-sw4");
    daquiA(4);
    de(G, null, "outra");
    daquiA(6);
    // A primeira foto tem 6 min: venceu, mesmo com o vendedor postando no meio.
    assert.equal(de(G, "Corolla GLi 2020 60.000km", null).tipo, "bufferado", "texto espera a foto dele");
  } finally {
    Date.now = relogio;
  }
});

if (falhas > 0) {
  console.error(`\n${falhas} caso(s) falharam`);
  process.exit(1);
}
console.log("\nOK — pareamento de foto e texto conferido.");
