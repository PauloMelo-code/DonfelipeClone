#!/usr/bin/env tsx
/**
 * Trava dos cartoes "Capturas hoje" e "Publicacoes hoje" do Dashboard.
 *
 * Os dois vinham errados (cliente, 22/09/2026). Tres motivos, todos cobertos
 * aqui: o dia do cliente comeca em Sao Paulo e nao em UTC; captura que a
 * triagem automatica rejeitou nunca chegou ao operador; e o historico de
 * publicacao tem uma linha por GRUPO de destino, entao um anuncio enviado a
 * cinco grupos valia cinco.
 *
 * Precisa de DATABASE_URL (banco local, nunca producao).
 * Uso: DATABASE_URL=... pnpm --filter web exec tsx tests/contagens-do-dia.test.ts
 */
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { diaLocal, inicioDeDiasAtras, inicioDoDia } from "../src/lib/dia";

// ── O dia do cliente, sem depender do fuso da maquina ──────────────────────
{
  const instante = (iso: string) => new Date(iso);
  // 23/09 02:30 em UTC ainda e 22/09 23:30 em Sao Paulo.
  assert.equal(diaLocal(instante("2026-09-23T02:30:00Z")), "2026-09-22", "antes das 3h UTC ainda e ontem");
  assert.equal(diaLocal(instante("2026-09-23T03:30:00Z")), "2026-09-23");
  assert.equal(inicioDoDia(instante("2026-09-23T02:30:00Z")).toISOString(), "2026-09-22T03:00:00.000Z");
  assert.equal(inicioDoDia(instante("2026-09-23T12:00:00Z")).toISOString(), "2026-09-23T03:00:00.000Z");
  assert.equal(inicioDeDiasAtras(7, instante("2026-09-23T12:00:00Z")).toISOString(), "2026-09-16T03:00:00.000Z");
}

const GRUPO_ORIGEM = "120000000000000901@g.us";
const DESTINOS = ["120000000000000902@g.us", "120000000000000903@g.us", "120000000000000904@g.us"];

async function main() {
  const { db, veiculos, gruposWhatsapp, historicoPublicacao } = await import("../src/lib/db");
  const { contagensDoDia } = await import("../src/lib/contagens-do-dia");

  const todos = [GRUPO_ORIGEM, ...DESTINOS];
  const limpar = async () => {
    await db.delete(historicoPublicacao).where(inArray(historicoPublicacao.targetGroupId, DESTINOS));
    await db.delete(veiculos).where(inArray(veiculos.sourceGroupId, [GRUPO_ORIGEM]));
    await db.delete(gruposWhatsapp).where(inArray(gruposWhatsapp.groupId, todos));
  };
  await limpar();

  const inicio = inicioDoDia();
  const hoje = new Date(inicio.getTime() + 60 * 60 * 1000); // 1h depois da virada
  const ontemTarde = new Date(inicio.getTime() - 2 * 60 * 60 * 1000); // 22h de ontem

  await db.insert(gruposWhatsapp).values([
    { groupId: GRUPO_ORIGEM, name: "Origem", role: "SOURCE", active: true },
    ...DESTINOS.map((g, i) => ({ groupId: g, name: `Destino ${i + 1}`, role: "TARGET", active: true })),
  ]);

  const carro = (sufixo: string, capturedAt: Date, autoRejectedReason: string | null) => ({
    model: `TESTE CONTAGEM ${sufixo}`, year: 2023, km: 50000, price: 100000,
    status: autoRejectedReason ? "REJECTED" : "PENDING",
    autoRejectedReason, capturedAt,
    sourceGroupId: GRUPO_ORIGEM, sourceMessageId: `contagem-${sufixo}`,
    vehicleHash: `contagem-${sufixo}`, identityHash: `contagem-${sufixo}`,
    photos: "[]", features: "[]",
  });

  const [a, b] = await db.insert(veiculos).values([
    carro("a", hoje, null),
    carro("b", hoje, null),
    // Rejeitado pela triagem automatica: o operador nunca viu.
    carro("c", hoje, "blocklist:teste"),
    // Capturado ontem as 22h -- com o corte em UTC, entrava no "hoje".
    carro("d", ontemTarde, null),
  ]).returning();

  // Um anuncio publicado em TRES grupos + uma tentativa que falhou.
  await db.insert(historicoPublicacao).values([
    ...DESTINOS.map((g) => ({ vehicleId: a.id, vehicleHash: a.vehicleHash!, targetGroupId: g, success: true, postedAt: hoje })),
    { vehicleId: b.id, vehicleHash: b.vehicleHash!, targetGroupId: DESTINOS[0], success: false, postedAt: hoje, errorMessage: "teste" },
  ]);

  const { capturas, publicacoes } = await contagensDoDia(inicio);
  assert.equal(capturas, 2, `capturas de hoje: 2 (o auto-rejeitado e o de ontem nao contam), veio ${capturas}`);
  assert.equal(publicacoes, 1, `publicacoes de hoje: 1 anuncio, nao 3 linhas de grupo, veio ${publicacoes}`);

  await limpar();
  console.log("\nOK — Capturas hoje e Publicacoes hoje contam o que o cliente ve.");
  process.exit(0);
}

main().catch((e) => {
  console.error(`FALHOU ${(e as Error).message}`);
  process.exit(1);
});
