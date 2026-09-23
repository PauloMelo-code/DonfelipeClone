#!/usr/bin/env tsx
/**
 * Trava da nota do carro (o "Score N/10" do card).
 *
 * O cliente pegou uma Sportage 2018, 91 mil km, 16% abaixo da FIPE, com nota
 * 2/10 (22/09/2026) e perguntou como o sistema chegava nisso. O anuncio dizia
 * "SEM SINISTRO" e "SEM LEILÃO", e a nota lia so as palavras: tirava 5 pontos
 * do carro por ele NAO ter passado por leilao.
 *
 * Uso: pnpm --filter web exec tsx tests/quality-score.test.ts
 */
import assert from "node:assert/strict";
import { calculateQualityScore, temSinalDeRisco } from "../src/lib/quality-score";

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

// A Sportage do cliente: 2018, 91 mil km, FIPE 108.000, por 91.000 (-16%).
const SPORTAGE = { km: 91000, year: 2018, price: 91000, fipePrice: 108000 };
const nota = (rawDescription: string) => calculateQualityScore({ ...SPORTAGE, rawDescription });

caso("negado nao e risco: 'sem sinistro' nao derruba a nota", () => {
  const boa = nota("SPORTAGE EX 2.0\nBem nova\nSEM SINISTRO\nSEM LEILÃO\nPneus novos");
  assert.equal(boa.score, 7, `a Sportage do cliente vale 7, nao 2 (veio ${boa.score})`);
  assert.ok(!boa.reasons.some((r) => /risco/i.test(r)), boa.reasons.join(" · "));

  for (const texto of [
    "Sem sinistro", "Não tem leilão", "Nunca passou por leilão", "Sem passagem por leilão",
    "Zero leilão", "Livre de sinistro", "Nenhum sinistro", "Não batido",
  ]) {
    assert.ok(!temSinalDeRisco(texto.toLowerCase()), `nao e risco: ${texto}`);
  }
});

caso("risco de verdade continua derrubando a nota", () => {
  const ruim = nota("SPORTAGE EX 2.0\nCarro de leilão\nPneus novos");
  assert.equal(ruim.score, 2, `leilao de verdade: 2 (veio ${ruim.score})`);
  assert.ok(ruim.reasons.some((r) => /risco/i.test(r)));

  for (const texto of [
    "Carro de leilão", "Tem sinistro", "Sinistro recuperado", "Passou por leilão",
    "Média monta no documento", "Recuperado de enchente", "Batido na frente",
  ]) {
    assert.ok(temSinalDeRisco(texto.toLowerCase()), `e risco: ${texto}`);
  }
});

caso("a nota explica cada ponto -- e o que o card mostra", () => {
  const r = nota("SPORTAGE EX 2.0\nÚnico dono\nRevisões na concessionária\nSem sinistro");
  assert.deepEqual(r.reasons, ["Carro antigo", "Desconto excelente (16%)", "Único dono", "Revisado/laudo"]);
  assert.equal(r.score, 9);
  // "Único dono" com acento: o \b do JS nao enxergava o "Ú" e o ponto se perdia.
  assert.ok(calculateQualityScore({ ...SPORTAGE, rawDescription: "Único dono" }).reasons.includes("Único dono"));
  assert.ok(calculateQualityScore({ ...SPORTAGE, rawDescription: "unico dono" }).reasons.includes("Único dono"));
  // Laudo: o cliente usa Dekra e cautelar.
  assert.ok(calculateQualityScore({ ...SPORTAGE, rawDescription: "Dekra aprovada" }).reasons.includes("Revisado/laudo"));
});

caso("km, idade e desconto pesam como antes", () => {
  const novo = calculateQualityScore({ km: 20000, year: 2025, price: 80000, fipePrice: 100000, rawDescription: "" });
  assert.equal(novo.score, 10, novo.reasons.join(" · "));
  const rodado = calculateQualityScore({ km: 180000, year: 2014, price: 50000, fipePrice: 51000, rawDescription: "" });
  assert.equal(rodado.score, 1, rodado.reasons.join(" · "));
  const acimaDaFipe = calculateQualityScore({ km: 50000, year: 2024, price: 110000, fipePrice: 100000, rawDescription: "" });
  assert.ok(acimaDaFipe.reasons.includes("Acima da FIPE"));
});

if (falhas > 0) {
  console.error(`\n${falhas} caso(s) falharam`);
  process.exit(1);
}
console.log("\nOK — a nota do carro conferida, com negacao e motivos.");
