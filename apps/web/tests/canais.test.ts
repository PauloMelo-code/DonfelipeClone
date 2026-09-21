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
import { novasPublicacoes } from "../src/lib/canais/publicacoes";
import { tipoDaImagem } from "../src/lib/media-storage";

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

  // O formato REAL da UAZAPI, conferido contra a instancia do cliente em
  // 17/09/2026: a lista vem em `response` e o nome aninhado em
  // `thread_metadata.name.text`. Era isso que deixava a aba Canais zerada.
  devolvendo({
    response: [
      {
        id: "120363314667002720@newsletter",
        state: { type: "active" },
        thread_metadata: {
          creation_time: "1719500187",
          name: { text: "TOME REPASSES", id: "1777382155558705" },
          description: { text: "TU QUER PRECO?" },
          subscribers_count: "12",
          picture: null,
          preview: { url: "" },
        },
        viewer_metadata: { mute: "on", role: "subscriber" },
      },
    ],
  });
  const real = await uazapi.listNewsletters();
  assert.equal(real.length, 1, "a lista vem dentro de `response`");
  assert.equal(real[0].id, "120363314667002720@newsletter");
  assert.equal(real[0].subject, "TOME REPASSES", "o nome vem de thread_metadata.name.text");
  assert.equal(real[0].size, 12);

  // Outra versao da API: id curto e jid lado a lado. Vale o jid.
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

  // ── Endereco novo da conversa 1-1 ───────────────────────────────
  // A instancia do cliente tem 1.588 chats `@lid` e so 2 `@s.whatsapp.net`.
  // Eram lidos como tipo desconhecido, e a mensagem de lista de transmissao
  // chegava e era descartada.
  devolvendo({
    chats: [
      { wa_chatid: "218812345678901@lid", wa_contactName: "Fornecedor" },
      { wa_chatid: "5551999998888@s.whatsapp.net", wa_name: "Contato antigo" },
      { wa_chatid: "120363000000000201@g.us", wa_name: "Grupo", wa_isGroup: true },
    ],
  });
  const chats = await uazapi.listChats();
  assert.deepEqual(chats.map((c) => c.kind), ["lid", "user", "group"], "@lid e conversa 1-1");

  // ── A foto da publicacao do canal ──────────────────────────────────────
  // Formatos reais de /newsletter/messages (15 a 17/09/2026): metade das
  // publicacoes vem SEM `URL`, so com `directPath`. O link sai dele -- sem
  // isto o carro do canal nem entrava.
  const CAMINHO = "/m1/v/t24/An_FNtT88c?ccb=9-4&oh=01_Q5&oe=6A0F1B26&_nc_sid=e6ed6c";
  devolvendo({
    response: [
      { messageid: "com-url", timestamp: "2026-09-16T16:09:33Z",
        message: { imageMessage: { URL: "https://mmg.whatsapp.net/m1/v/t24/Aaa?oe=1", directPath: "/m1/v/t24/Aaa?oe=1", caption: "Vitara" } } },
      { messageid: "so-caminho", timestamp: "2026-09-15T13:55:34Z",
        message: { imageMessage: { directPath: CAMINHO, caption: "Onix" } } },
      { messageid: "so-texto", timestamp: "2026-09-14T19:19:10Z", message: { conversation: "Bom dia, grupo" } },
    ],
  });
  const fotos = Object.fromEntries((await uazapi.newsletterMessages("1@newsletter")).map((p) => [p.messageId, p.imagemUrl]));
  assert.equal(fotos["com-url"], "https://mmg.whatsapp.net/m1/v/t24/Aaa?oe=1", "com URL, vale a URL");
  assert.equal(fotos["so-caminho"], `https://mmg.whatsapp.net${CAMINHO}`, "sem URL, o link sai do directPath");
  assert.equal(fotos["so-texto"], null, "publicacao sem foto continua sem foto");

  // So vira foto o que e imagem de verdade: pagina de erro ou arquivo
  // cifrado guardado como foto e o card com o "?" no lugar da imagem.
  const bytes = (...b: number[]) => Buffer.concat([Buffer.from(b), Buffer.alloc(16)]);
  assert.equal(tipoDaImagem(bytes(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg");
  assert.equal(tipoDaImagem(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), "image/png");
  assert.equal(tipoDaImagem(Buffer.concat([Buffer.from("RIFF\0\0\0\0WEBP"), Buffer.alloc(8)])), "image/webp");
  assert.equal(tipoDaImagem(Buffer.from("<!DOCTYPE html><html>erro</html>")), null, "HTML nao e foto");
  assert.equal(tipoDaImagem(bytes(0x13, 0x37, 0xbe, 0xef)), null, "arquivo cifrado nao e foto");

  // ── O que conta como publicacao nova ────────────────────────────────────
  const post = (horasAtras: number, id: string) => ({
    messageId: id,
    quando: new Date(Date.now() - horasAtras * 60 * 60 * 1000),
    texto: "anuncio",
    imagemUrl: "https://mmg.whatsapp.net/foto.jpg",
  });
  const agora = new Date();

  // Primeiro giro do canal: so a janela inicial, senao capturaria meses de
  // anuncio velho de uma vez.
  const primeiroGiro = novasPublicacoes([post(48, "velho"), post(1, "recente")], null, agora);
  assert.deepEqual(primeiroGiro.map((p) => p.messageId), ["recente"]);

  // Com marcador, so o que veio depois dele.
  const marcador = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const depois = novasPublicacoes([post(48, "velho"), post(3, "antes"), post(1, "depois")], marcador, agora);
  assert.deepEqual(depois.map((p) => p.messageId), ["depois"]);

  // Em ordem de publicacao, e no maximo dez por giro.
  const muitas = Array.from({ length: 15 }, (_, i) => post(i / 60, `p${i}`));
  const limitadas = novasPublicacoes(muitas, marcador, agora);
  assert.equal(limitadas.length, 10, "teto de dez por giro");
  assert.ok(
    limitadas.every((p, i) => i === 0 || p.quando >= limitadas[i - 1].quando),
    "entrega na ordem em que foram publicadas",
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
