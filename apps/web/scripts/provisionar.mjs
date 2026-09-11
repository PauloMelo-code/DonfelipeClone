#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Provisiona uma base NOVA de producao: o primeiro administrador e as
// configuracoes padrao. Nada alem disso.
//
// Existe porque `db:seed` nao serve aqui. Aquele e um seed de DEMONSTRACAO:
// apaga usuarios, veiculos, grupos e auditoria e planta uma operacao ficticia
// inteira -- inclusive grupos de WhatsApp que nao existem. Grupo falso num
// sistema que PUBLICA em grupo e risco real, e por isso o seed se recusa a
// rodar com NODE_ENV=production. O efeito colateral era nao sobrar forma
// nenhuma de provisionar producao. Esta e a forma.
//
// Em JavaScript puro e com SQL direto de proposito: a imagem de runtime nao
// tem TypeScript nem tsx. Ela roda o standalone do Next e tem apenas
// drizzle-orm, postgres e bcryptjs instalados -- as mesmas dependencias que o
// migrate.mjs usa.
//
// NAO APAGA NADA. Se ja existe usuario, para sem tocar no banco: rodar duas
// vezes por engano nao cria segundo admin nem sobrescreve senha.
//
//   SEED_ADMIN_PASSWORD='<senha forte>' node apps/web/scripts/provisionar.mjs
// ---------------------------------------------------------------------------
import bcrypt from "bcryptjs";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

const TAMANHO_MINIMO_DA_SENHA = 15;

const CONFIGURACOES_PADRAO = [
  ["profit_margin_percent", "10"],
  ["delay_min_seconds", "5"],
  ["delay_max_seconds", "15"],
  ["filter_min_year", "2018"],
  ["filter_min_price", "30000"],
];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[provisionar] DATABASE_URL nao definida.");
  process.exit(1);
}

const senha = process.env.SEED_ADMIN_PASSWORD ?? "";
if (senha.length < TAMANHO_MINIMO_DA_SENHA) {
  console.error(
    `[provisionar] SEED_ADMIN_PASSWORD ausente ou com menos de ${TAMANHO_MINIMO_DA_SENHA} caracteres.`
  );
  process.exit(1);
}

const email = process.env.ADMIN_EMAIL ?? "admin@donfelipe.com.br";
const nome = process.env.ADMIN_NOME ?? "Administrador";

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  const [existente] = await sql`select id from users limit 1`;
  if (existente) {
    console.log("[provisionar] ja existe usuario nesta base: nada a fazer.");
    console.log("  Para trocar senha use a tela de Seguranca, nunca este script.");
  } else {
    const hash = await bcrypt.hash(senha, 10);
    await sql`
      insert into users (id, email, name, password, role, active)
      values (${randomUUID()}, ${email}, ${nome}, ${hash}, 'ADMIN', true)
    `;
    console.log("[provisionar] administrador criado:", email);
  }

  // So insere a chave que ainda nao existe: nao sobrescreve margem ou delay
  // que alguem ja tenha ajustado na tela de configuracoes.
  let criadas = 0;
  for (const [chave, valor] of CONFIGURACOES_PADRAO) {
    const [ja] = await sql`select id from settings where key = ${chave} limit 1`;
    if (ja) continue;
    await sql`insert into settings (id, key, value) values (${randomUUID()}, ${chave}, ${valor})`;
    criadas++;
  }
  console.log(`[provisionar] configuracoes: ${criadas} criadas, ${CONFIGURACOES_PADRAO.length - criadas} ja existiam`);
  console.log("[provisionar] ok");
} catch (erro) {
  console.error("[provisionar] FALHOU:", erro?.message ?? erro);
  if (erro?.detail) console.error("[provisionar] detalhe:", erro.detail);
  process.exitCode = 1;
} finally {
  await sql.end();
}
