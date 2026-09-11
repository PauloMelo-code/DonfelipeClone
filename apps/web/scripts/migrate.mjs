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
//
// onnotice: a 0000 adapta um banco que veio do Prisma e usa ADD COLUMN IF NOT
// EXISTS em dezenas de colunas. Cada uma que ja existe vira um NOTICE, e o
// driver despeja o objeto inteiro -- sete linhas por coluna. Num deploy isso
// enterra o erro que interessa e o log do painel corta antes dele. Contamos e
// resumimos numa linha; erro e warning de verdade continuam passando.
let avisosIgnorados = 0;
const conexao = postgres(url, {
  max: 1,
  onnotice: (aviso) => {
    if (aviso?.severity === "NOTICE") {
      avisosIgnorados++;
      return;
    }
    console.warn("[migrate] aviso do banco:", aviso?.message ?? aviso);
  },
});

try {
  console.log("[migrate] aplicando migracoes de", pastaMigracoes);
  await migrate(drizzle(conexao), { migrationsFolder: pastaMigracoes });
  if (avisosIgnorados > 0) {
    console.log(
      `[migrate] ${avisosIgnorados} avisos "ja existe, pulando" do banco (esperado: a 0000 adapta o schema que veio do Prisma)`
    );
  }
  console.log("[migrate] ok");
} catch (erro) {
  console.error("[migrate] FALHOU:", erro?.message ?? erro);
  if (erro?.position) console.error("[migrate] posicao no SQL:", erro.position);
  if (erro?.detail) console.error("[migrate] detalhe:", erro.detail);
  if (erro?.hint) console.error("[migrate] dica:", erro.hint);
  process.exitCode = 1;
} finally {
  await conexao.end();
}
