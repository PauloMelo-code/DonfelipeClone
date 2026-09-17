#!/usr/bin/env tsx
/**
 * Trava da leitura de canais (newsletters).
 *
 * O cliente seguia canais e a aba Canais continuava zerada. Duas causas
 * possiveis, e as duas passavam em silencio: a API devolvia o canal num
 * formato que o codigo nao reconhecia, ou a chamada falhava e virava "nenhum
 * canal".
 *
 * O canal tem DOIS identificadores -- um `id` curto e o `jid` que termina em
 * `@newsletter`. O sistema inteiro fala em JID: guardar o id curto criava um
 * canal que nunca casava com a mensagem que chegava pelo webhook.
 *
 * Sobe uma API falsa em 127.0.0.1: nenhuma chamada sai da maquina.
 * Uso: pnpm --filter web exec tsx tests/canais.test.ts
 */
import assert from "node:assert/strict";
import http from "node:http";

const PORTA = 5994;
process.env.UAZAPI_BASE_URL = `http://127.0.0.1:${PORTA}`;
process.env.UAZAPI_TOKEN = "token-de-teste";

import { uazapi } from "../src/lib/uazapi";

let resposta: unknown = [];
let status = 200;

const servidor = http.createServer((_req, res) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(resposta));
});

/** Responde o proximo /newsletter/list com isto. */
const devolvendo = (corpo: unknown, http = 200) => {
  resposta = corpo;
  status = http;
};

async function main() {
  await new Promise<void>((ok) => servidor.listen(PORTA, "127.0.0.1", ok));

  // O formato da documentacao: id curto e jid separados. Vale o jid.
  devolvendo({
    newsletters: [
      { id: "1719594192374762", jid: "120363159896440801@newsletter", name: "Canal Repasse" },
    ],
  });
  const comJid = await uazapi.listNewsletters();
  assert.equal(comJid.length, 1);
  assert.equal(comJid[0].id, "120363159896440801@newsletter", "o JID vale mais que o id curto");
  assert.equal(comJid[0].subject, "Canal Repasse");

  // Lista crua, so com o numero do canal: vira JID.
  devolvendo([{ id: "120363159896440801", name: "Canal Sem Sufixo" }]);
  const soNumero = await uazapi.listNewsletters();
  assert.equal(soNumero[0].id, "120363159896440801@newsletter", "numero de canal vira JID");

  // Outra versao da API embrulha em `chats` e chama o campo de `chatid`.
  devolvendo({ chats: [{ chatid: "120363000000000201@newsletter", name: "Canal C" }] });
  const emChats = await uazapi.listNewsletters();
  assert.equal(emChats[0].id, "120363000000000201@newsletter", "tambem le a resposta em chats");

  // So o id curto, sem jid: NAO inventa um JID que nao existe.
  devolvendo({ newsletters: [{ id: "1719594192374762", name: "So id curto" }] });
  const semJid = await uazapi.listNewsletters();
  assert.equal(semJid[0].id, "1719594192374762", "id curto nao vira JID de mentira");

  // Falha da API nao pode virar "nenhum canal": quem chama precisa saber.
  devolvendo({ error: "instancia desconectada" }, 500);
  await assert.rejects(
    () => uazapi.listNewsletters(),
    "erro na API tem que estourar, nao devolver lista vazia",
  );

  servidor.close();
  console.log("OK — leitura de canais travada.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
