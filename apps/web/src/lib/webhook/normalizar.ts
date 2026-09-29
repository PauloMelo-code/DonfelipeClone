/* eslint-disable @typescript-eslint/no-explicit-any */
import { uazapi } from "@/lib/uazapi";

// ---------------------------------------------------------------------------
// Normalizacao do payload do webhook.
//
// Chegam DOIS formatos: o plano da UAZAPI ({ EventType, chat: {...} }) e o
// aninhado padrao ({ event, data: { key, message } }). Todo o resto do
// pipeline trabalha em cima de uma unica forma, definida aqui.
//
// Isto morava dentro do handler, junto com autenticacao, dedup, IA e
// persistencia, num arquivo de mil linhas.
// ---------------------------------------------------------------------------

/**
 * Conversa 1-1 -- por onde chega a mensagem de LISTA DE TRANSMISSAO. Grupo tem
 * `participant` proprio, e canal chega inteiro (foto e legenda juntas), entao
 * nenhum dos dois entra aqui.
 */
function ehConversaDeUmPraUm(jid: unknown): jid is string {
  return typeof jid === "string" && !jid.endsWith("@g.us") && !jid.endsWith("@newsletter");
}

export interface MensagemNormalizada {
  groupJid: string | null;
  messageId: string;
  isFromMe: boolean;
  pushName: string | null;
  /** JID unico de quem enviou. Usado para parear foto com legenda. */
  senderJid: string | null;
  textContent: string | null;
  imageUrl: string | null;
  /** O objeto `chat` cru: o processamento ainda le flags de comunidade/canal. */
  chat: Record<string, any>;
}

export type ResultadoNormalizacao =
  | { ok: true; msg: MensagemNormalizada }
  | { ok: false; motivo: "event_type" };

/**
 * Pede a midia ja DECIFRADA pra UAZAPI.
 *
 * O que vem em `imageMessage.url`/`directPath` aponta pro CDN do WhatsApp, e
 * o que esta la e blob cifrado: sem a `mediaKey` aquilo nao e JPEG nenhum.
 * Quem decifra e a UAZAPI, entao a foto sai daqui -- a url do payload so
 * serve de reserva, e de reserva ruim.
 */
async function midiaDaUazapi(id: string): Promise<string | null> {
  try {
    const media = await uazapi.downloadMedia(id);
    if (media) {
      const mType =
        media.mimetype === "application/octet-stream" ? "image/jpeg" : media.mimetype;
      if (media.base64Data) return `data:${mType};base64,${media.base64Data}`;
      if (media.fileURL) return media.fileURL;
    }
  } catch (err) {
    console.warn("[Webhook] UAZAPI download failed:", err);
  }
  return null;
}

/** Baixa a imagem de uma ImageMessage da UAZAPI e devolve data URI ou URL. */
async function baixarImagem(raw: any, chat: any, content: any): Promise<string | null> {
  // O stanzaID do WhatsApp pode estar em varios lugares do payload.
  let contentObj: Record<string, unknown> | null = null;
  if (typeof content === "object" && content !== null) {
    contentObj = content;
  } else if (typeof content === "string" && content.startsWith("{")) {
    try {
      contentObj = JSON.parse(content);
    } catch {
      /* ignore */
    }
  }

  const ctxInfo = contentObj?.contextInfo as Record<string, unknown> | undefined;
  const msgCtxInfo = raw.message?.contextInfo as Record<string, unknown> | undefined;

  const waMessageId =
    ctxInfo?.stanzaID ||
    ctxInfo?.stanzaId ||
    msgCtxInfo?.stanzaID ||
    msgCtxInfo?.stanzaId ||
    chat.stanzaID ||
    raw.message?.messageId ||
    raw.message?.id ||
    null;

  if (process.env.NODE_ENV === "development") {
    console.log(
      "[Webhook] ImageMessage IDs - stanzaID:",
      waMessageId,
      "contextInfo keys:",
      ctxInfo ? Object.keys(ctxInfo).join(",") : "none"
    );
  }

  if (!waMessageId) return null;

  const midia = await midiaDaUazapi(waMessageId as string);
  if (midia) {
    console.log("[Webhook] Image downloaded OK");
    return midia;
  }

  // NAO existe fallback por outros ids: baixar por id de outra mensagem
  // trazia a foto errada para o anuncio.
  console.warn("[Webhook] Image download failed for stanzaID:", waMessageId, "- skipping");
  return null;
}

/** Formato plano da UAZAPI. */
async function doFormatoUazapi(raw: any): Promise<ResultadoNormalizacao> {
  const chat = raw.chat || {};
  const event = raw.EventType || "messages";
  if (event !== "messages") return { ok: false, motivo: "event_type" };

  const groupJid = chat.wa_chatid || chat.chatid || null;
  const messageId = chat.stanzaID || chat.messageId || raw.id || "uazapi_" + Date.now();
  const isFromMe = chat.fromMe === true || chat.fromMe === "true";
  const pushName = chat.senderName || chat.pushName || chat.wa_name || null;
  // Em GRUPO o remetente vem em `participant`. Em conversa 1-1 -- por onde
  // chega a mensagem de LISTA DE TRANSMISSAO -- muitas vezes nao vem nenhum
  // dos tres, e sem remetente a esteira nao junta a foto com a legenda que
  // veio na mensagem seguinte: o anuncio morria como "sem foto". Na conversa
  // 1-1, quem manda e a propria conversa.
  const daConversa = ehConversaDeUmPraUm(groupJid) ? groupJid : null;
  // A ordem importa, e `wa_lastMessageSender` vem por ULTIMO de proposito.
  //
  // Ele e o remetente da ultima mensagem DO CHAT, nao desta mensagem. Num
  // grupo movimentado isso quebra o pareamento: o vendedor posta a foto,
  // alguem mais posta qualquer coisa, e quando o texto chega o campo ja aponta
  // pra outra pessoa. As duas pecas caem em gavetas diferentes, a foto morre
  // como "sem legenda" e o texto como "sem foto" -- o anuncio inteiro se perde
  // (cliente, 29/09/2026: "grupos que postam a foto primeiro nao chegam").
  //
  // `senderJid` e `participant` descrevem ESTA mensagem, e em conversa 1-1
  // quem manda e a propria conversa. Qualquer um dos tres vale mais.
  const senderJid = daConversa || chat.senderJid || chat.participant || chat.wa_lastMessageSender;

  const msgType = chat.wa_lastMessageType || chat.messageType || "";
  const content = chat.content || "";

  let textContent: string | null = null;
  let imageUrl: string | null = null;

  if (msgType === "Conversation" || msgType === "ExtendedTextMessage") {
    textContent = content || chat.wa_lastMessageTextVote || null;
  } else if (msgType === "VideoMessage") {
    // Video: so a legenda; a midia nao e baixada.
    textContent = chat.wa_lastMessageTextVote || chat.caption || null;
  } else if (msgType === "ImageMessage") {
    imageUrl = await baixarImagem(raw, chat, content);

    let contentObj: Record<string, unknown> | null = null;
    if (typeof content === "object" && content !== null) contentObj = content;
    else if (typeof content === "string" && content.startsWith("{")) {
      try {
        contentObj = JSON.parse(content);
      } catch {
        /* ignore */
      }
    }

    // A legenda aparece em varios campos do payload UAZAPI.
    textContent =
      (contentObj?.caption as string) ||
      (contentObj?.text as string) ||
      chat.wa_lastMessageTextVote ||
      chat.wa_lastMessageText ||
      chat.caption ||
      chat.text ||
      null;
  }

  // Ultimo recurso: qualquer campo de texto que nao seja uma URL.
  if (!textContent) {
    const fallback = chat.wa_lastMessageTextVote || content || null;
    if (fallback && typeof fallback === "string" && !fallback.startsWith("http")) {
      textContent = fallback;
    }
  }

  if (raw.message) {
    if (!textContent && raw.message.conversation) textContent = raw.message.conversation;
    if (!textContent && raw.message.extendedTextMessage?.text) {
      textContent = raw.message.extendedTextMessage.text;
    }
    if (raw.message.imageMessage) {
      imageUrl = imageUrl || raw.message.imageMessage.url || null;
      textContent = textContent || raw.message.imageMessage.caption || null;
    }
  }

  return {
    ok: true,
    msg: { groupJid, messageId, isFromMe, pushName, senderJid, textContent, imageUrl, chat },
  };
}

/** Formato aninhado padrao. */
async function doFormatoPadrao(raw: any): Promise<ResultadoNormalizacao> {
  const event = raw.event || "messages";
  if (event !== "messages.upsert" && event !== "messages") {
    return { ok: false, motivo: "event_type" };
  }

  const data = raw.data || raw;
  const key = data.key || {};
  const message = data.message || {};

  // E por aqui que entra a publicacao de CANAL, que o sistema vai buscar de 5
  // em 5 minutos. Ate 25/09/2026 esta linha pegava a url do CDN e pronto --
  // ou seja, o blob cifrado -- e a foto do canal nunca aparecia no card.
  let imageUrl: string | null = null;
  if (message.imageMessage) {
    const url = message.imageMessage.url;
    // Quem manda a imagem ja pronta (a busca de canais decifra antes de
    // entregar) nao precisa que a esteira peca download nenhum.
    imageUrl =
      typeof url === "string" && url.startsWith("data:")
        ? url
        : (key.id ? await midiaDaUazapi(String(key.id)) : null) || url || null;
  }

  return {
    ok: true,
    msg: {
      groupJid: key.remoteJid || null,
      messageId: key.id || "std_" + Date.now(),
      isFromMe: !!key.fromMe,
      pushName: data.pushName || null,
      // Quem postou: usado pra juntar as fotos extras do mesmo anuncio. Em
      // conversa 1-1 (por onde chega a lista de transmissao) nao vem
      // `participant`: ali quem manda e a propria conversa.
      senderJid:
        key.participant ||
        data.senderJid ||
        (ehConversaDeUmPraUm(key.remoteJid) ? key.remoteJid : null),
      textContent:
        message.conversation ||
        message.extendedTextMessage?.text ||
        message.imageMessage?.caption ||
        null,
      imageUrl,
      chat: raw.chat || {},
    },
  };
}

export async function normalizarPayload(raw: any): Promise<ResultadoNormalizacao> {
  const chat = raw.chat || {};
  const ehUazapi = !!raw.EventType || !!chat.wa_chatid;
  const r = ehUazapi ? await doFormatoUazapi(raw) : await doFormatoPadrao(raw);

  if (r.ok && process.env.NODE_ENV === "development") {
    console.log("[Webhook] Parsed:", {
      groupJid: r.msg.groupJid,
      messageId: r.msg.messageId,
      isFromMe: r.msg.isFromMe,
      hasImage: !!r.msg.imageUrl,
    });
  }
  return r;
}
