#!/usr/bin/env tsx
/**
 * Mensagens de uma conversa chegam ao pareamento na ordem em que chegaram.
 *
 * Cliente, 01/10/2026: "foto de Up e descrição de City". Numa rajada de
 * anuncios encaminhados, a foto (que baixa antes de parear) perdia a vez pro
 * texto do carro seguinte.
 *
 * Uso: pnpm --filter web exec tsx tests/fila.test.ts
 */
import assert from "node:assert/strict";
import { entrarNaFila } from "../src/lib/webhook/fila";

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function mensagem(conversa: string, nome: string, baixa: number, ordem: string[]) {
  const liberar = await entrarNaFila(conversa);
  await espera(baixa); // a foto baixando
  ordem.push(nome); // o pareamento
  liberar();
}

async function main() {
  const ordem: string[] = [];
  // Chegam nesta ordem; a foto do City demora pra baixar.
  await Promise.all([
    mensagem("g1", "foto do City", 80, ordem),
    mensagem("g1", "texto do City", 0, ordem),
    mensagem("g1", "texto do ASX", 0, ordem),
    mensagem("g1", "foto do ASX", 40, ordem),
  ]);
  assert.deepEqual(ordem, ["foto do City", "texto do City", "texto do ASX", "foto do ASX"]);

  // Conversas diferentes nao esperam uma pela outra.
  const outra: string[] = [];
  await Promise.all([mensagem("g2", "lenta", 80, outra), mensagem("g3", "rapida", 0, outra)]);
  assert.deepEqual(outra, ["rapida", "lenta"]);

  // Liberar duas vezes nao fura a fila de ninguem.
  const l = await entrarNaFila("g4");
  l();
  l();

  console.log("OK — a conversa pareia na ordem em que chegou.");
  process.exit(0);
}
main().catch((e) => {
  console.error(`FALHOU ${(e as Error).message}`);
  process.exit(1);
});
