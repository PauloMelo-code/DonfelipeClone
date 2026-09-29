#!/usr/bin/env tsx
/**
 * Duas falhas que o cliente pegou em 23/09/2026:
 *
 *  - "tentei enviar mesmo sem foto e ela nao publicar": o envio escolhia
 *    foto x texto pela CONTAGEM de fotos, sem saber se a foto prestava. Com
 *    uma foto que nao resolve (URL de CDN que nao baixa mais, id de midia que
 *    nao existe), ia pra UAZAPI um arquivo impossivel, ela recusava e o
 *    anuncio nao saia pra grupo nenhum -- sem aviso na tela.
 *
 *  - "a IA nao esta capturando veiculos da lista de transmissao": mensagem de
 *    lista chega pela CONVERSA do vendedor, e ali muitas vezes nao vem
 *    remetente nenhum no payload. Sem remetente a esteira nao junta a foto com
 *    a legenda da mensagem seguinte, e o anuncio morria como "sem foto".
 *
 * Precisa de DATABASE_URL (banco local, nunca producao).
 * Uso: DATABASE_URL=... pnpm --filter web exec tsx tests/envio-e-lista.test.ts
 */
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

let falhas = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`FALHOU ${nome}\n       ${(e as Error).message.split("\n").join("\n       ")}`);
  }
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]).toString("base64");

async function main() {
  const { db, arquivosMidia } = await import("../src/lib/db");
  const { resolverFotoParaEnvio } = await import("../src/lib/publisher");
  const { normalizarPayload } = await import("../src/lib/webhook/normalizar");

  const ID = "teste-envio-foto";
  await db.delete(arquivosMidia).where(eq(arquivosMidia.id, ID));
  await db.insert(arquivosMidia).values({ id: ID, mimeType: "image/jpeg", data: JPEG });

  await caso("foto boa vai como imagem", async () => {
    const pronta = await resolverFotoParaEnvio(`/api/media/${ID}`);
    assert.equal(pronta, `data:image/jpeg;base64,${JPEG}`);
  });

  await caso("foto que nao da pra usar vale como SEM foto -- e o texto sai", async () => {
    // Id de midia que nao existe mais (anuncio antigo, midia apagada).
    assert.equal(await resolverFotoParaEnvio("/api/media/nao-existe"), null);
    // Caminho relativo sem midia, string vazia, nulo.
    assert.equal(await resolverFotoParaEnvio(""), null);
    assert.equal(await resolverFotoParaEnvio(null), null);
    assert.equal(await resolverFotoParaEnvio(undefined), null);
    // Endereco que nem e foto.
    assert.equal(await resolverFotoParaEnvio("sei-la-o-que"), null);
    // URL que nao baixa: o guarda de SSRF recusa rede interna na hora.
    assert.equal(await resolverFotoParaEnvio("http://127.0.0.1:9/foto.jpg"), null);
  });

  await caso("data URI passa direto", async () => {
    const uri = `data:image/jpeg;base64,${JPEG}`;
    assert.equal(await resolverFotoParaEnvio(uri), uri);
  });

  await caso("lista de transmissao: sem remetente no payload, vale a conversa", async () => {
    const dm = await normalizarPayload({
      event: "messages.upsert",
      data: { key: { remoteJid: "218812345678901@lid", id: "m1", fromMe: false }, message: { conversation: "Hilux 2020" } },
    });
    assert.ok(dm.ok);
    if (dm.ok) {
      assert.equal(dm.msg.senderJid, "218812345678901@lid", "sem remetente, quem manda e a propria conversa");
      assert.equal(dm.msg.groupJid, "218812345678901@lid");
    }

    // Em GRUPO nada muda: o remetente continua sendo quem postou.
    const grupo = await normalizarPayload({
      event: "messages.upsert",
      data: {
        key: { remoteJid: "120363000000000201@g.us", id: "m2", fromMe: false, participant: "5551999998888@s.whatsapp.net" },
        message: { conversation: "Onix 2021" },
      },
    });
    assert.ok(grupo.ok);
    if (grupo.ok) assert.equal(grupo.msg.senderJid, "5551999998888@s.whatsapp.net");

    // Canal chega inteiro (foto e legenda juntas) e nao pode entrar na fila
    // de pareamento: a legenda de um post colaria na foto do seguinte.
    const canal = await normalizarPayload({
      event: "messages.upsert",
      data: { key: { remoteJid: "120363314667002720@newsletter", id: "m4", fromMe: false }, message: { conversation: "Ranger 2026" } },
    });
    assert.ok(canal.ok);
    if (canal.ok) assert.equal(canal.msg.senderJid, null, "canal nao pareia");

    // O remetente DESTA mensagem vale mais que o da ultima do chat.
    //
    // `wa_lastMessageSender` e o remetente da ultima mensagem do CHAT. Num
    // grupo movimentado ele muda entre a foto e a legenda -- basta alguem
    // mais postar no meio -- e as duas pecas caem em gavetas diferentes: a
    // foto morre "sem legenda", o texto "sem foto", e o anuncio se perde
    // (cliente, 29/09/2026: "grupos que postam a foto primeiro nao chegam").
    const grupoMovimentado = await normalizarPayload({
      EventType: "messages",
      chat: {
        wa_chatid: "120363000000000201@g.us",
        // Outra pessoa postou entre a foto e a legenda.
        wa_lastMessageSender: "5551900000000@s.whatsapp.net",
        participant: "5551999998888@s.whatsapp.net",
        wa_lastMessageType: "Conversation",
        content: "Onix 2021 50.000km",
      },
    });
    assert.ok(grupoMovimentado.ok);
    if (grupoMovimentado.ok) {
      assert.equal(
        grupoMovimentado.msg.senderJid,
        "5551999998888@s.whatsapp.net",
        "vale quem postou ESTA mensagem, nao quem postou a ultima do grupo",
      );
    }

    // Grupo sem participant continua sem remetente -- ali a conversa e o grupo
    // inteiro, e parear foto com legenda de gente diferente seria pior.
    const grupoSemParticipant = await normalizarPayload({
      event: "messages.upsert",
      data: { key: { remoteJid: "120363000000000201@g.us", id: "m3", fromMe: false }, message: { conversation: "Gol 2015" } },
    });
    assert.ok(grupoSemParticipant.ok);
    if (grupoSemParticipant.ok) assert.equal(grupoSemParticipant.msg.senderJid, null);
  });

  await db.delete(arquivosMidia).where(eq(arquivosMidia.id, ID));
  if (falhas > 0) {
    console.error(`\n${falhas} caso(s) falharam`);
    process.exit(1);
  }
  console.log("\nOK — envio sem foto e captura de lista conferidos.");
  process.exit(0);
}

main().catch((e) => {
  console.error(`FALHOU ${(e as Error).message}`);
  process.exit(1);
});
