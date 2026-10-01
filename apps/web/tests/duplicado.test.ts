#!/usr/bin/env tsx
/**
 * O que conta como "o mesmo carro" na regra dos 30 dias (fica o mais barato).
 *
 * Cliente, 01/10/2026: "muitos carros nao estao chegando". Um HB20 Comfort
 * 2024 com 55.000km, R$ 59.000, da Eduardo, foi descartado como duplicado de
 * OUTRO HB20 Comfort 2024 -- 48.000km, R$ 58.900, de outro fornecedor. A
 * tolerancia de km era 20%, e carro popular sumia em massa.
 *
 * Uso: pnpm --filter web exec tsx tests/duplicado.test.ts
 */
import assert from "node:assert/strict";
import { faixaDoMesmoKm, generateVehicleIdentityHash, modelosCasam } from "../src/lib/deduplication";

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
const dentro = (km: number, outro: number) => {
  const f = faixaDoMesmoKm(km);
  return outro >= f.min && outro <= f.max;
};

caso("o mesmo km escrito de outro jeito e o mesmo carro", () => {
  assert.ok(dentro(55000, 55000));
  assert.ok(dentro(55000, 54870), "'54.870' e '55 mil'");
  assert.ok(dentro(8000, 7500), "km baixo: folga minima de mil");
});
caso("km de outro carro nao e o mesmo carro", () => {
  assert.ok(!dentro(55000, 48000), "o HB20 da Eduardo contra o de outro fornecedor");
  assert.ok(!dentro(100000, 90000));
});
caso("modelos: igual ou contido com duas palavras ou mais", () => {
  assert.ok(modelosCasam("Hyundai HB20 Comfort 1.0 Flex 12v", "HB20 Comfort 1.0 Mec"));
  assert.ok(modelosCasam("ONIX LT 1.0", "Onix LT Turbo"));
  assert.ok(!modelosCasam("HB20", "HB20 Sense 1.0 Flex"), "'HB20' sozinho nao engole todo HB20");
  assert.ok(!modelosCasam("HB20 Sense 1.0 Flex", "HB20 Comfort 1.0"));
});
caso("hash de identidade: mil a mil, e nao dez em dez", () => {
  const h = (km: number) => generateVehicleIdentityHash({ model: "HB20 Comfort 1.0", year: 2024, km });
  assert.equal(h(55000), h(54870));
  assert.notEqual(h(55000), h(64000), "55 e 64 mil viravam o mesmo '60.000'");
  assert.notEqual(h(55000), h(48000));
});

if (falhas > 0) {
  console.error(`\n${falhas} caso(s) falharam`);
  process.exit(1);
}
console.log("\nOK — regra do mesmo carro conferida.");
process.exit(0);
