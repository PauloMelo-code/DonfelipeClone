import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  criarAdmin, criarAuditoria, criarConfiguracoes,
  criarGrupos, criarHistorico, criarVeiculos, limpar,
} from "./seed/passos";
import { conferirAmbiente, senhaDoAdmin } from "./seed/seguranca";

// ---------------------------------------------------------------------------
// Base de demonstracao do Don Felipe Repasses.
//
// Monta uma operacao inteira e crivel: grupos de origem e destino, carros em
// todos os estados da fila, historico de publicacao com falha de verdade e a
// trilha de auditoria correspondente.
//
// ATENCAO: este seed APAGA as tabelas antes de popular. Nao roda sozinho --
// saiu do entrypoint do container de proposito -- e exige SEED_ADMIN_PASSWORD.
//
//   SEED_ADMIN_PASSWORD='...' pnpm db:seed
// ---------------------------------------------------------------------------

const conexao = postgres(process.env.DATABASE_URL ?? "", { max: 1 });
const db = drizzle(conexao);

async function main() {
  conferirAmbiente();
  // Lida antes de apagar qualquer coisa: se faltar, a base fica intacta.
  const senha = senhaDoAdmin();

  console.log("Seeding Don Felipe database with demo data...\n");

  await limpar(db);
  const admin = await criarAdmin(db, senha);
  await criarConfiguracoes(db);

  const grupos = await criarGrupos(db);
  const gravados = await criarVeiculos(db, grupos.fonte);
  await criarHistorico(db, gravados, grupos.destino);
  await criarAuditoria(db, gravados, admin.id);

  console.log("\nDemo seed completed!");
  console.log("Login: admin@donfelipe.com.br / (a senha de SEED_ADMIN_PASSWORD)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await conexao.end();
  });
