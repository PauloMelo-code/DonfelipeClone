#!/usr/bin/env tsx
/**
 * Trava do agrupamento de anuncios repetidos na tela de Pendentes.
 *
 * O cliente convive com isso desde o comeco do sistema (26/09/2026): quatro
 * fornecedores postam o mesmo carro e ele precisa achar, na mao, qual esta
 * mais barato. A deduplicacao automatica funde os casos obvios; o que sobra
 * na fila e justamente o que escapa dela, e e isso que este agrupamento pega.
 *
 * Nao funde nada: so poe lado a lado, do mais barato pro mais caro.
 *
 * Uso: pnpm --filter web exec tsx tests/repetidos.test.ts
 */
import assert from "node:assert/strict";
import { chaveDeRepetido, ordenarComRepetidosJuntos } from "../src/lib/repetidos";

let falhas = 0;
function caso(nome: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas++;
    console.error(`  FALHOU ${nome}\n    ${(e as Error).message}`);
  }
}

const carro = (
  id: string,
  model: string,
  km: number,
  price: number,
  fipePrice: number | null,
  minutosAtras = 0
) => ({
  id,
  model,
  km,
  price,
  fipePrice,
  capturedAt: new Date(Date.now() - minutosAtras * 60_000).toISOString(),
});

console.log("A chave");

caso("o mesmo carro escrito de jeitos diferentes cai na mesma chave", () => {
  const a = chaveDeRepetido(carro("a", "JEEP COMPASS LONGITUDE T270", 45000, 130000, 150000));
  const b = chaveDeRepetido(carro("b", "Compass Longitude 2.0 Flex", 47000, 128000, 150000));
  assert.ok(a);
  assert.equal(a, b, "modelo escrito diferente, mesma km e mesma Fipe = mesmo carro");
});

caso("a marca na frente nao muda a chave", () => {
  const a = chaveDeRepetido(carro("a", "TOYOTA COROLLA XEI", 50000, 90000, 100000));
  const b = chaveDeRepetido(carro("b", "Corolla XEi 2.0", 50000, 88000, 100000));
  assert.equal(a, b);
});

caso("km distante separa carros do mesmo modelo", () => {
  // A km nao esta na chave de proposito (fronteira de faixa separava 44 e 46
  // mil). Quem separa e o agrupamento, comparando os anuncios entre si.
  const { grupos } = ordenarComRepetidosJuntos([
    carro("perto", "COMPASS LONGITUDE", 45000, 130000, 150000),
    carro("longe", "COMPASS LONGITUDE", 120000, 110000, 150000),
  ]);
  assert.equal(grupos.size, 0, "45 mil e 120 mil km nao sao o mesmo carro");
});

caso("km proxima agrupa mesmo cruzando uma fronteira redonda", () => {
  const { ordenados, grupos } = ordenarComRepetidosJuntos([
    carro("a", "COMPASS LONGITUDE", 44000, 133000, 150000),
    carro("b", "COMPASS LONGITUDE", 46000, 128000, 150000),
  ]);
  assert.equal(grupos.size, 2, "2.000 km de diferenca e o mesmo carro");
  assert.deepEqual(ordenados.map((v) => v.id), ["b", "a"], "o mais barato na frente");
});

caso("Fipe distante separa versoes/anos diferentes", () => {
  const a = chaveDeRepetido(carro("a", "COMPASS LONGITUDE", 45000, 130000, 150000));
  const b = chaveDeRepetido(carro("b", "COMPASS LONGITUDE", 45000, 130000, 190000));
  assert.notEqual(a, b, "Fipe de 150 mil e de 190 mil sao carros diferentes");
});

caso("sem Fipe nao agrupa -- no chute poria carro errado lado a lado", () => {
  assert.equal(chaveDeRepetido(carro("a", "COMPASS LONGITUDE", 45000, 130000, null)), null);
});

caso("sem km nao agrupa", () => {
  assert.equal(chaveDeRepetido(carro("a", "COMPASS LONGITUDE", 0, 130000, 150000)), null);
});

console.log("A ordem da fila");

caso("os quatro fornecedores ficam juntos, do mais barato pro mais caro", () => {
  const { ordenados, grupos } = ordenarComRepetidosJuntos([
    carro("caro", "COMPASS LONGITUDE", 45000, 139000, 150000, 30),
    carro("barato", "Jeep Compass Longitude T270", 46000, 128000, 150000, 20),
    carro("medio", "COMPASS LONGITUDE 2.0", 44000, 133000, 150000, 10),
  ]);
  assert.deepEqual(ordenados.map((v) => v.id), ["barato", "medio", "caro"]);
  assert.equal(grupos.get("barato")?.total, 3, "o grupo tem os tres");
  assert.equal(grupos.get("barato")?.posicao, 1, "o mais barato e o primeiro");
  assert.equal(grupos.get("caro")?.posicao, 3);
});

caso("quem nao tem par nao entra em grupo nenhum", () => {
  const { grupos } = ordenarComRepetidosJuntos([
    carro("sozinho", "GOL TREND", 80000, 35000, 40000),
  ]);
  assert.equal(grupos.size, 0, "grupo de um nao e repetido");
});

caso("a fila continua com o mais novo na frente", () => {
  // O grupo sobe junto com o integrante mais recente dele: o operador nao
  // perde a nocao de "chegou agora" so porque o carro tem repetido.
  const { ordenados } = ordenarComRepetidosJuntos([
    carro("antigo", "PALIO FIRE", 90000, 25000, 28000, 120),
    carro("dup-caro", "ONIX LT", 50000, 62000, 70000, 60),
    carro("novo", "GOL TREND", 80000, 35000, 40000, 5),
    carro("dup-barato", "Onix LT 1.0", 52000, 58000, 70000, 1),
  ]);
  assert.deepEqual(
    ordenados.map((v) => v.id),
    ["dup-barato", "dup-caro", "novo", "antigo"],
    "o grupo do Onix sobe porque um deles chegou ha 1 minuto",
  );
});

caso("dois grupos diferentes nao se misturam", () => {
  const { ordenados, grupos } = ordenarComRepetidosJuntos([
    carro("onix-a", "ONIX LT", 50000, 62000, 70000, 40),
    carro("compass-a", "COMPASS LONGITUDE", 45000, 139000, 150000, 30),
    carro("onix-b", "Onix LT 1.0", 52000, 58000, 70000, 20),
    carro("compass-b", "Compass Longitude T270", 46000, 128000, 150000, 10),
  ]);
  assert.deepEqual(ordenados.map((v) => v.id), ["compass-b", "compass-a", "onix-b", "onix-a"]);
  assert.equal(grupos.get("onix-a")?.chave, grupos.get("onix-b")?.chave);
  assert.notEqual(grupos.get("onix-a")?.chave, grupos.get("compass-a")?.chave);
});

caso("empate de preco mantem os dois no grupo, o mais novo na frente", () => {
  const { ordenados, grupos } = ordenarComRepetidosJuntos([
    carro("velho", "ONIX LT", 50000, 60000, 70000, 60),
    carro("recente", "ONIX LT", 51000, 60000, 70000, 5),
  ]);
  assert.deepEqual(ordenados.map((v) => v.id), ["recente", "velho"]);
  assert.equal(grupos.get("recente")?.total, 2);
});

if (falhas > 0) {
  console.error(`\n${falhas} caso(s) falharam`);
  process.exit(1);
}
console.log("\nOK — repetidos ficam lado a lado, do mais barato pro mais caro.");
