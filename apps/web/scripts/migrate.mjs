#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Aplica as migracoes do Drizzle. Substitui o `prisma db push` que rodava no
// docker-entrypoint.sh com --accept-data-loss.
//
// Uso: DATABASE_URL=... node apps/web/scripts/migrate.mjs
// ---------------------------------------------------------------------------
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL nao definida.");
  process.exit(1);
}

const aqui = dirname(fileURLToPath(import.meta.url));
const pastaMigracoes = resolve(aqui, "../src/lib/db/migrations");

// max: 1 — o migrator precisa de uma sessao so; as funcoes pg_temp da
// migracao vivem na sessao e sao chamadas por statements seguintes.
const conexao = postgres(url, { max: 1 });

try {
  console.log("[migrate] aplicando migracoes de", pastaMigracoes);
  await migrate(drizzle(conexao), { migrationsFolder: pastaMigracoes });
  console.log("[migrate] ok");
} catch (erro) {
  console.error("[migrate] FALHOU:", erro);
  process.exitCode = 1;
} finally {
  await conexao.end();
}
