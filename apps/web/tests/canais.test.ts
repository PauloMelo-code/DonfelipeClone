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
import { agruparPublicacoes, ateOndeMarcar, novasPublicacoes } from "../src/lib/canais/publicacoes";
import { decifrarImagem } from "../src/lib/canais/foto-do-canal";
import { createCipheriv, hkdfSync, randomBytes } from "node:crypto";
import { normalizarPayload } from "../src/lib/webhook/normalizar";
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

  // -------------------------------------------------------------------
  // A FOTO do canal.
  //
  // A publicacao de canal entra pelo formato aninhado do webhook. Ate
  // 25/09/2026 esse formato pegava `imageMessage.url` e pronto -- e o que
  // esta naquela url e o blob CIFRADO do CDN do WhatsApp, nao um JPEG. A foto
  // do canal nunca aparecia no card. Quem decifra e a UAZAPI.
  // -------------------------------------------------------------------
  const doCanal = (id: string) => ({
    event: "messages",
    data: {
      key: { remoteJid: "120363314667002720@newsletter", id, fromMe: false },
      pushName: "TOME REPASSES",
      message: {
        imageMessage: {
          url: "https://mmg.whatsapp.net/o1/v/cifrado.enc",
          caption: "GOL 2020 40.000KM R$ 45.000",
        },
      },
    },
  });

  devolvendo({ base64Data: "R0lGODlhAQABAA==", mimetype: "application/octet-stream" });
  const comFoto = await normalizarPayload(doCanal("POST_1"));
  assert.ok(comFoto.ok, "publicacao de canal e reconhecida");
  assert.ok(
    comFoto.msg.imageUrl?.startsWith("data:image/jpeg;base64,"),
    `a foto vem decifrada da UAZAPI, veio: ${comFoto.msg.imageUrl}`,
  );
  assert.ok(
    !comFoto.msg.imageUrl?.includes("mmg.whatsapp.net"),
    "a url cifrada do CDN nao vira a foto do anuncio",
  );

  // Se a UAZAPI nao entregar, a url do payload ainda serve de reserva -- e o
  // comportamento antigo, que ao menos deixa o anuncio entrar.
  devolvendo({}, 500);
  const semDownload = await normalizarPayload(doCanal("POST_2"));
  assert.ok(semDownload.ok, "sem download a publicacao ainda e reconhecida");
  assert.equal(
    semDownload.msg.imageUrl,
    "https://mmg.whatsapp.net/o1/v/cifrado.enc",
    "a url do payload fica de reserva quando a UAZAPI nao entrega",
  );

  // Publicacao so de texto nao chama download nenhum.
  devolvendo({}, 500);
  const soTexto = await normalizarPayload({
    event: "messages",
    data: {
      key: { remoteJid: "120363314667002720@newsletter", id: "POST_3", fromMe: false },
      message: { conversation: "GOL 2020" },
    },
  });
  assert.ok(soTexto.ok && soTexto.msg.imageUrl === null, "post sem imagem nao tem foto");
  assert.equal(soTexto.ok && soTexto.msg.textContent, "GOL 2020");

  // -------------------------------------------------------------------
  // O MARCADOR.
  //
  // Com 3 canais a 10 publicacoes, o giro batia no teto de 30/min do webhook
  // e o terceiro canal levava 429 -- mas o marcador andava por cima assim
  // mesmo, e aquele anuncio nunca mais voltava. Era por isso que so um canal
  // chegava (25/09/2026).
  // -------------------------------------------------------------------
  const p1 = post(3, "p1"), p2 = post(2, "p2"), p3 = post(1, "p3");

  assert.equal(
    ateOndeMarcar([{ publicacao: p1, atendida: true }, { publicacao: p2, atendida: true }])?.messageId,
    "p2",
    "todas atendidas: o marcador vai ate a ultima",
  );
  assert.equal(
    ateOndeMarcar([{ publicacao: p1, atendida: true }, { publicacao: p2, atendida: false }, { publicacao: p3, atendida: true }])?.messageId,
    "p1",
    "o marcador para ANTES da que a esteira recusou",
  );
  assert.equal(
    ateOndeMarcar([{ publicacao: p1, atendida: false }]),
    null,
    "primeira recusada: o marcador nao anda",
  );
  assert.equal(ateOndeMarcar([]), null, "sem publicacao, o marcador nao anda");

  // -------------------------------------------------------------------
  // COMO O CANAL PUBLICA.
  //
  // O cliente confirmou os tres jeitos (25/09/2026): foto com a legenda
  // junto, foto num post e o texto no seguinte, e varias fotos e depois o
  // texto. So o primeiro virava carro -- nos outros a foto era descartada
  // por "sem legenda" e o texto por "sem foto".
  // -------------------------------------------------------------------
  /** Agrupa com o mesmo "agora" dos casos, pra a janela ser deterministica. */
  const agrupar = (ps: Parameters<typeof agruparPublicacoes>[0]) => agruparPublicacoes(ps, agora).anuncios;

  const pub = (minutosAtras: number, id: string, texto: string | null, foto: string | null) => ({
    messageId: id,
    quando: new Date(agora.getTime() - minutosAtras * 60 * 1000),
    texto,
    imagemUrl: foto,
  });

  // 1. Foto com legenda: um anuncio, uma publicacao.
  const juntos = agrupar([pub(10, "a1", "GOL 2020 R$ 45.000", "f1.jpg")]);
  assert.equal(juntos.length, 1, "foto com legenda vira um anuncio");
  assert.equal(juntos[0].fotos.length, 1);
  assert.equal(juntos[0].texto, "GOL 2020 R$ 45.000");

  // 2. Foto num post, texto no seguinte.
  const separados = agrupar([
    pub(10, "b1", null, "f1.jpg"),
    pub(9, "b2", "ONIX 2021 R$ 60.000", null),
  ]);
  assert.equal(separados.length, 1, "foto + texto seguinte viram UM anuncio");
  assert.deepEqual(separados[0].fotos.map((f) => f.messageId), ["b1"]);
  assert.equal(separados[0].texto, "ONIX 2021 R$ 60.000");
  assert.equal(separados[0].ultima.messageId, "b2", "o marcador anda ate o texto");

  // 3. Varias fotos e depois o texto: album, a primeira e a capa.
  const album = agrupar([
    pub(10, "c1", null, "f1.jpg"),
    pub(10, "c2", null, "f2.jpg"),
    pub(9, "c3", null, "f3.jpg"),
    pub(9, "c4", "STRADA 2022 R$ 90.000", null),
  ]);
  assert.equal(album.length, 1, "varias fotos + texto viram UM anuncio");
  assert.deepEqual(album[0].fotos.map((f) => f.messageId), ["c1", "c2", "c3"], "na ordem, a primeira e a capa");
  assert.equal(album[0].texto, "STRADA 2022 R$ 90.000");

  // 4. O erro que ja aconteceu: a foto de um anuncio NAO pode ir no texto do
  //    seguinte. Aqui os dois anuncios estao longe um do outro no tempo.
  const doisAnuncios = agrupar([
    pub(60, "d1", null, "foto-do-primeiro.jpg"),
    pub(10, "d2", "SAVEIRO 2019 R$ 55.000", null),
  ]);
  assert.equal(doisAnuncios.length, 1, "so o texto vira anuncio");
  assert.equal(doisAnuncios[0].fotos.length, 0, "a foto velha NAO cola no texto de 50 min depois");

  // 5. Dois anuncios completos em seguida nao se misturam.
  const emSequencia = agrupar([
    pub(10, "e1", null, "f1.jpg"),
    pub(10, "e2", "GOL 2020", null),
    pub(9, "e3", null, "f2.jpg"),
    pub(9, "e4", "ONIX 2021", null),
  ]);
  assert.equal(emSequencia.length, 2, "dois anuncios");
  assert.deepEqual(emSequencia[0].fotos.map((f) => f.messageId), ["e1"]);
  assert.equal(emSequencia[0].texto, "GOL 2020");
  assert.deepEqual(emSequencia[1].fotos.map((f) => f.messageId), ["e3"], "o segundo leva SO a foto dele");
  assert.equal(emSequencia[1].texto, "ONIX 2021");

  // 6. Foto sem texto nenhum depois nao vira carro: entraria sem dado algum.
  assert.equal(agrupar([pub(5, "g1", null, "f1.jpg")]).length, 0, "foto orfa nao vira anuncio");

  // 6b. O PADRAO DO CANAL "TOME REPASSES", visto na producao em 25/09/2026:
  //     o texto do anuncio vem PRIMEIRO e as fotos logo depois, segundos
  //     atras. Ate entao o agrupamento so olhava pra tras: o anuncio entrava
  //     sem foto nenhuma e as fotos viravam orfas, giro apos giro.
  const textoPrimeiro = agrupar([
    pub(10, "t1", "CAPTIVA SPORT 2.4 FWD", null),
    pub(9.9, "t2", null, "f1.jpg"),
    pub(9.9, "t3", null, "f2.jpg"),
  ]);
  assert.equal(textoPrimeiro.length, 1, "texto primeiro tambem vira um anuncio");
  assert.deepEqual(textoPrimeiro[0].fotos.map((f) => f.messageId), ["t2", "t3"], "as fotos de depois entram");
  assert.equal(textoPrimeiro[0].ultima.messageId, "t3", "o marcador anda ate a ultima foto");

  // 6c. Uma foto entre dois textos vai pro MAIS PROXIMO, e nao sempre pro
  //     seguinte. E o unico criterio que serve aos dois jeitos de publicar:
  //     dentro de um anuncio as pecas estao a segundos, o vizinho a minutos.
  const entreDois = agrupar([
    pub(10, "u1", "GOL 2020", null),
    pub(9.9, "u2", null, "perto-do-gol.jpg"),
    pub(7, "u3", "ONIX 2021", null),
    pub(6.9, "u4", null, "perto-do-onix.jpg"),
  ]);
  assert.equal(entreDois.length, 2);
  assert.deepEqual(entreDois[0].fotos.map((f) => f.messageId), ["u2"], "a foto fica com o GOL, que esta a segundos dela");
  assert.deepEqual(entreDois[1].fotos.map((f) => f.messageId), ["u4"], "e a outra com o ONIX");

  // 6d. Publicacao que o sistema nao sabe ler (video sem legenda, enquete)
  //     nao vira anuncio, mas tem que sair da frente -- senao o marcador nao
  //     passa e o canal para de entregar. Foi o que prendeu o FCAR.
  const ilegivel = agruparPublicacoes([pub(5, "v1", null, null)], agora);
  assert.equal(ilegivel.anuncios.length, 0);
  assert.equal(ilegivel.aguardando.length, 0, "nao adianta esperar por ela");
  assert.equal(ilegivel.perdidas.length, 1, "sai da frente pro marcador andar");

  // 7. FOTO ESPERANDO O TEXTO. O canal postou as fotos e o texto ainda nao
  //    veio: o marcador NAO pode passar por elas, senao o anuncio se perde
  //    quando o texto chegar no giro seguinte. (25/09/2026: dois canais
  //    apareceram com "novas: 3, capturadas: 0" exatamente assim.)
  const esperando = agruparPublicacoes([pub(1, "i1", null, "f1.jpg"), pub(1, "i2", null, "f2.jpg")], agora);
  assert.equal(esperando.anuncios.length, 0, "sem texto ainda nao ha anuncio");
  assert.equal(esperando.aguardando.length, 2, "as duas fotos ficam esperando o texto");
  assert.equal(esperando.perdidas.length, 0, "nenhuma esta perdida: sao recentes");

  // 8. FOTO QUE NUNCA VAI PAREAR. Passada a janela, ela tem que sair do
  //    caminho -- senao o canal fica preso relendo a mesma foto pra sempre e
  //    nenhum anuncio novo entra.
  const morta = agruparPublicacoes([pub(30, "j1", null, "f1.jpg")], agora);
  assert.equal(morta.anuncios.length, 0);
  assert.equal(morta.aguardando.length, 0, "velha demais: nao espera mais");
  assert.equal(morta.perdidas.length, 1, "sai do caminho pro marcador poder andar");

  // 9. Texto sozinho continua valendo -- e como o canal sem foto sempre entrou.
  const soTextoNoCanal = agrupar([pub(5, "h1", "PALIO 2015 R$ 25.000", null)]);
  assert.equal(soTextoNoCanal.length, 1);
  assert.equal(soTextoNoCanal[0].fotos.length, 0);

  // -------------------------------------------------------------------
  // A FOTO DE CANAL VEM CIFRADA.
  //
  // A UAZAPI nao entrega midia de canal pelo id da publicacao -- os quatro
  // canais do cliente responderam vazio em 26/09/2026. O que ela manda e o
  // endereco no CDN do WhatsApp, e o arquivo de la e cifrado com a
  // `mediaKey` da publicacao. Sem decifrar, guardavamos lixo e o card ficava
  // sem foto.
  // -------------------------------------------------------------------
  const jpegOriginal = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
    randomBytes(200),
  ]);
  const mediaKey = randomBytes(32);
  const derivada = Buffer.from(hkdfSync("sha256", mediaKey, Buffer.alloc(32), "WhatsApp Image Keys", 112));
  const cifrador = createCipheriv("aes-256-cbc", derivada.subarray(16, 48), derivada.subarray(0, 16));
  const arquivoDoCdn = Buffer.concat([
    cifrador.update(jpegOriginal),
    cifrador.final(),
    randomBytes(10), // a assinatura no fim, que nao faz parte da imagem
  ]);

  const aberta = decifrarImagem(arquivoDoCdn, mediaKey.toString("base64"));
  assert.ok(aberta, "com a mediaKey certa a imagem abre");
  assert.ok(aberta.equals(jpegOriginal), "e sai byte a byte igual a original");

  assert.equal(
    decifrarImagem(arquivoDoCdn, randomBytes(32).toString("base64")),
    null,
    "chave errada devolve null em vez de lixo",
  );
  assert.equal(decifrarImagem(arquivoDoCdn, ""), null, "sem chave, null");
  assert.equal(
    decifrarImagem(randomBytes(64), mediaKey.toString("base64")),
    null,
    "arquivo que nao e o esperado devolve null, nao uma foto quebrada",
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
