#!/usr/bin/env tsx
/**
 * Trava dos filtros de captura.
 *
 * Estas sao as regras que decidem o que entra na fila de revisao. Elas sairam
 * de dentro de um handler de mil linhas; o teste garante que a extracao nao
 * mudou nenhuma delas.
 *
 * Precisa de DATABASE_URL: as configuracoes vem do banco.
 * Uso: DATABASE_URL=... pnpm --filter web exec tsx tests/filtros.test.ts
 */
import assert from "node:assert/strict";
import { aplicarFiltros } from "../src/lib/webhook/filtros";

const base = {
  model: "ONIX LT", brand: "CHEVROLET", year: 2020, km: 45000, price: 48990,
  state: "RS", transmission: null, fuel: null, features: [], photos: [],
  fipePrice: 58000,
  grupo: { region: "RS", filters: null, name: "Fonte RS" },
};

async function main() {
  const ok = await aplicarFiltros(base);
  assert.equal(ok.passou, true, "carro bom deveria passar");

  const velho = await aplicarFiltros({ ...base, year: 2010 });
  assert.equal(velho.passou, false);
  if (!velho.passou) assert.equal(velho.resposta.reason, "vehicle_too_old");

  const barato = await aplicarFiltros({ ...base, price: 5000 });
  assert.equal(barato.passou, false);
  if (!barato.passou) assert.equal(barato.resposta.reason, "vehicle_price_too_low");

  const rodado = await aplicarFiltros({ ...base, km: 500000 });
  assert.equal(rodado.passou, false);
  if (!rodado.passou) assert.equal(rodado.resposta.reason, "vehicle_km_too_high");

  const semMargem = await aplicarFiltros({ ...base, price: 57500, fipePrice: 58000 });
  assert.equal(semMargem.passou, false);
  if (!semMargem.passou) assert.equal(semMargem.resposta.reason, "fipe_discount_too_low");

  const precoAbsurdo = await aplicarFiltros({ ...base, price: 7_820_000 });
  assert.equal(precoAbsurdo.passou, false);
  if (!precoAbsurdo.passou) assert.equal(precoAbsurdo.resposta.reason, "price_likely_parse_error");

  const fipeAbsurda = await aplicarFiltros({ ...base, fipePrice: 5_800_000 });
  assert.equal(fipeAbsurda.passou, true, "FIPE absurda ignora a FIPE, nao descarta o carro");
  if (fipeAbsurda.passou) assert.equal(fipeAbsurda.fipePrice, null);

  const nacionalSemEstado = await aplicarFiltros({
    ...base, state: null, grupo: { region: "NACIONAL", filters: null, name: "Nacional" },
  });
  assert.equal(nacionalSemEstado.passou, false);
  if (!nacionalSemEstado.passou) {
    assert.equal(nacionalSemEstado.resposta.reason, "national_group_no_state_mentioned");
  }

  console.log("OK — filtros de captura preservam todas as regras.");
}
// O pool do Postgres segura o processo vivo: encerra explicitamente.
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
