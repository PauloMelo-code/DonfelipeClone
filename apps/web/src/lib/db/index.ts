import "../env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// ---------------------------------------------------------------------------
// Cliente unico do banco.
//
// Em dev o Next recarrega o modulo a cada edicao; sem o cache no globalThis
// cada reload abriria um pool novo ate estourar as conexoes do Postgres.
// ---------------------------------------------------------------------------

const globalParaDb = globalThis as unknown as {
  conexaoPostgres?: ReturnType<typeof postgres>;
};

const conexao =
  globalParaDb.conexaoPostgres ??
  postgres(process.env.DATABASE_URL ?? "", {
    max: 10,
    // O schema usa timestamptz; deixar o driver devolver Date em UTC.
    transform: { undefined: null },
  });

if (process.env.NODE_ENV !== "production") {
  globalParaDb.conexaoPostgres = conexao;
}

export const db = drizzle(conexao, { schema });

export * from "./schema";
export * from "./query";
