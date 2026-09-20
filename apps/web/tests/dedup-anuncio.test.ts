#!/usr/bin/env tsx
/**
 * Trava do item 7 da lista do cliente (20/09/2026).
 *
 * O cliente viu um card com a foto de um Fastback cinza e a fonte "Jessé -
 * Repasses", mas o "Ver anúncio" mostrava a descrição de OUTRO Fastback,
 * publicado em outro grupo. Causa: a dedup de 30 dias, ao achar preco menor,
 * trocava so `price` e `rawDescription` e deixava foto, grupo de origem e
 * anuncio refeito do anuncio antigo. O registro virava a mistura de dois.
 *
 * Regra: entre duplicatas fica a de menor preco -- e o registro que fica e
 * ESSE anuncio inteiro.
 *
 * Precisa de DATABASE_URL (banco local, nunca producao).
 * Uso: DATABASE_URL=... pnpm --filter web exec tsx tests/dedup-anuncio.test.ts
 */
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";

process.env.WEBHOOK_SECRET ||= "segredo-de-teste";
// Sem chave de IA: o anuncio refeito roda solto e cai no texto original --
// nenhuma chamada externa sai daqui.
delete process.env.OPENAI_API_KEY;
delete process.env.GEMINI_API_KEY;

// Import dinamico: as variaveis de ambiente acima tem que valer antes de o
// modulo do banco e o da rota serem carregados.
type Mods = {
  db: typeof import("../src/lib/db");
  rota: typeof import("../src/app/api/webhook/whatsapp/route");
  next: typeof import("next/server");
};
let M: Mods;

const GRUPO_A = "120000000000000001@g.us";
const GRUPO_B = "120000000000000002@g.us";

const anuncio = (preco: string, detalhe: string) => `FIAT FASTBACK AUDACE 1.0 TURBO
2023/2024
52.000 km
AUTOMATICO
${detalhe}
FIPE 150.000,00
POR ${preco}`;

// Uma foto por anuncio -- e a foto que o cliente viu desencontrada do texto.
const FOTO_A = "Zm90by1B";
const FOTO_B = "Zm90by1C";
const PNG = (conteudo: string) => `data:image/png;base64,${conteudo}`;

const envio = (grupo: string, id: string, texto: string, foto: string) =>
  new M.next.NextRequest("http://localhost/api/webhook/whatsapp", {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-secret": process.env.WEBHOOK_SECRET! },
    body: JSON.stringify({
      event: "messages.upsert",
      data: {
        // Sem `participant` de proposito: com remetente, o texto sem foto fica
        // no buffer esperando imagem e nunca chega na dedup.
        key: { remoteJid: grupo, id, fromMe: false },
        pushName: grupo === GRUPO_A ? "Jessé - Repasses" : "Outro Grupo",
        // A foto vai como data URI: fica no banco local, sem baixar nada.
        message: { imageMessage: { url: foto, caption: texto } },
      },
    }),
  });

async function limpar() {
  const { db, veiculos, gruposWhatsapp } = M.db;
  await db.delete(veiculos).where(inArray(veiculos.sourceGroupId, [GRUPO_A, GRUPO_B]));
  await db.delete(gruposWhatsapp).where(inArray(gruposWhatsapp.groupId, [GRUPO_A, GRUPO_B]));
}

async function main() {
  M = {
    db: await import("../src/lib/db"),
    rota: await import("../src/app/api/webhook/whatsapp/route"),
    next: await import("next/server"),
  };
  const { db, veiculos } = M.db;
  const POST = M.rota.POST;
  await limpar();

  const primeiro = await POST(envio(GRUPO_A, "msg-a", anuncio("109.990", "Teto solar"), PNG(FOTO_A)));
  assert.equal((await primeiro.json()).status ?? "captured", "captured",
    "o primeiro anuncio tinha que ser capturado");

  const segundo = await POST(envio(GRUPO_B, "msg-b", anuncio("99.990", "Pneus novos"), PNG(FOTO_B)));
  const r = await segundo.json();
  assert.equal(r.status, "updated_lower_price", `esperava troca pelo mais barato, veio ${JSON.stringify(r)}`);

  const linhas = await db.select().from(veiculos)
    .where(inArray(veiculos.sourceGroupId, [GRUPO_A, GRUPO_B]));
  assert.equal(linhas.length, 1, `os dois anuncios tinham que virar um registro so, vieram ${linhas.length}`);

  const [v] = linhas;
  // O registro que ficou e o anuncio de MENOR PRECO, inteiro: texto, grupo de
  // origem e id da mensagem sao todos dele.
  assert.equal(v.price, 99990, "ficou o preco menor");
  assert.ok(v.rawDescription?.includes("Pneus novos"), "o texto original e o do anuncio que ficou");
  assert.ok(!v.rawDescription?.includes("Teto solar"), "nao pode sobrar texto do anuncio que perdeu");
  assert.equal(v.sourceGroupId, GRUPO_B, "a fonte e a do anuncio que ficou");
  assert.equal(v.sourceMessageId, "msg-b", "a mensagem de origem e a do anuncio que ficou");
  assert.equal(v.adEditedAt, null, "o anuncio refeito do texto que perdeu foi zerado");
  // A foto e a do anuncio que ficou: foi ela que o cliente viu desencontrada.
  const fotos: string[] = JSON.parse(v.photos ?? "[]");
  assert.equal(fotos.length, 1, "uma foto so");
  assert.ok(fotos[0].includes(FOTO_B), `a foto tem que ser a do anuncio que ficou, veio ${fotos[0]}`);

  await limpar();
  console.log("\nOK — a dedup deixa um anuncio inteiro, nunca a mistura de dois.");
  process.exit(0);
}

main().catch(async (e) => {
  console.error(`FALHOU ${(e as Error).message}`);
  await limpar().catch(() => {});
  process.exit(1);
});
