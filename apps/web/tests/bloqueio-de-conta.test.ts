#!/usr/bin/env tsx
/**
 * Trava da leitura do bloqueio por conta.
 *
 * A parte que decide se a conta está travada AGORA é pura, e é onde mora a
 * armadilha: a coluna `locked_until` não é limpa quando o prazo expira, então
 * presença de valor NÃO é bloqueio. Quem comparar `IS NOT NULL` tranca a conta
 * para sempre.
 *
 * Uso: pnpm --filter web exec tsx tests/bloqueio-de-conta.test.ts
 */
import assert from "node:assert/strict";
import {
  FALHAS_ATE_TRAVAR,
  MINUTOS_DA_JANELA,
  MINUTOS_TRAVADO,
  estaTravada,
} from "../src/lib/bloqueio-de-conta";

const AGORA = new Date("2026-09-10T12:00:00.000Z");
const minutos = (n: number) => new Date(AGORA.getTime() + n * 60_000);

// ── Presença de valor não é bloqueio ──────────────────────────────────────
{
  const expirado = estaTravada({ lockedUntil: minutos(-1), failedAttempts: 5 }, AGORA);
  assert.equal(expirado.travada, false, "prazo vencido ha 1 minuto: a conta esta livre");
  assert.equal(expirado.ate, null, "e nao devolve data de destrave nenhuma");

  const vigente = estaTravada({ lockedUntil: minutos(1), failedAttempts: 5 }, AGORA);
  assert.equal(vigente.travada, true, "prazo daqui a 1 minuto: travada");
  assert.equal(vigente.ate?.toISOString(), minutos(1).toISOString());

  assert.equal(
    estaTravada({ lockedUntil: null, failedAttempts: 4 }, AGORA).travada,
    false,
    "quatro falhas sem trava ainda e conta livre",
  );
}

// ── O instante exato da virada ────────────────────────────────────────────
{
  assert.equal(
    estaTravada({ lockedUntil: AGORA, failedAttempts: 5 }, AGORA).travada,
    false,
    "no milissegundo exato do vencimento a conta ja esta livre",
  );
  assert.equal(
    estaTravada({ lockedUntil: new Date(AGORA.getTime() + 1), failedAttempts: 5 }, AGORA).travada,
    true,
    "um milissegundo depois ainda esta travada",
  );
}

// ── O contador acompanha a leitura ────────────────────────────────────────
{
  assert.equal(estaTravada({ lockedUntil: null, failedAttempts: 3 }, AGORA).falhas, 3);
  assert.equal(estaTravada({ lockedUntil: minutos(5), failedAttempts: 9 }, AGORA).falhas, 9);
}

// ── Os parâmetros são coerentes entre si ──────────────────────────────────
{
  assert.ok(FALHAS_ATE_TRAVAR >= 3, "poucas demais travariam quem so errou de dedo");
  assert.ok(FALHAS_ATE_TRAVAR <= 10, "muitas demais nao seguram preenchimento de credencial");
  assert.ok(MINUTOS_TRAVADO > 0, "trava perpetua vira negacao de servico contra o dono");
  assert.ok(
    MINUTOS_DA_JANELA >= MINUTOS_TRAVADO,
    "a janela nao pode ser menor que a trava, senao a sequencia morre antes de destravar",
  );
}

console.log("OK — leitura do bloqueio por conta travada.");
