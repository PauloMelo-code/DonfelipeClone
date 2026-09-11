// ---------------------------------------------------------------------------
// Pareamento de foto + legenda enviadas em mensagens separadas.
//
// O vendedor manda as fotos e o texto do anuncio como mensagens diferentes, em
// qualquer ordem, e as vezes o texto vem fragmentado ("Onix LT", "2020, 50k").
// Este modulo segura as pecas ate formar um anuncio.
//
// So pareia quando existe o JID do remetente: sem ele, duas pessoas postando
// no mesmo grupo ao mesmo tempo teriam a foto de uma casada com o texto da
// outra.
//
// ponytail: buffer em memoria do processo. Reinicio perde o que estava
// aguardando, e duas instancias nao compartilham. Migrar para Redis quando a
// aplicacao passar a rodar em mais de um processo.
// ---------------------------------------------------------------------------

interface MensagemBufferizada {
  /** Fila ordenada por chegada (mais antiga primeiro). */
  imageUrls: string[];
  textContent?: string;
  messageId: string;
  senderJid: string;
  timestamp: number;
}

const _buffer = new Map<string, MensagemBufferizada>();
const TTL_MS = 5 * 60 * 1000; // 5 min -- vendedor demora a mandar tudo
const MAX_FOTOS = 12;
const MAX_CHARS_TEXTO = 2000;

function limparExpirados() {
  const agora = Date.now();
  for (const [chave, msg] of _buffer.entries()) {
    if (agora - msg.timestamp > TTL_MS) _buffer.delete(chave);
  }
}

// Limpa periodicamente mesmo sem trafego.
if (typeof setInterval !== "undefined") {
  const timer = setInterval(limparExpirados, 30_000);
  // Nao segurar o processo vivo so por causa disto.
  if (typeof timer.unref === "function") timer.unref();
}

function chaveDoBuffer(groupJid: string, senderJid: string | null): string {
  if (!senderJid) return ""; // sem remetente nao ha pareamento seguro
  return `${groupJid}:${senderJid}`;
}

export interface EntradaPareamento {
  groupJid: string;
  senderJid: string | null;
  messageId: string;
  textContent: string | null;
  imageUrl: string | null;
}

export type ResultadoPareamento =
  | {
      tipo: "segue";
      textContent: string | null;
      imageUrl: string | null;
      /** Fotos do album a anexar depois que o veiculo for criado. */
      fotosExtras: string[];
    }
  | { tipo: "bufferado"; resposta: Record<string, unknown> };

export function parear(entrada: EntradaPareamento): ResultadoPareamento {
  const { groupJid, senderJid, messageId } = entrada;
  let { textContent, imageUrl } = entrada;
  let fotosExtras: string[] = [];

  limparExpirados();
  const chave = chaveDoBuffer(groupJid, senderJid);
  const guardado = chave ? _buffer.get(chave) : null;

  if (imageUrl && !textContent && chave) {
    if (guardado?.textContent && (!guardado.imageUrls || guardado.imageUrls.length === 0)) {
      // Texto ja estava esperando esta foto: pareia.
      textContent = guardado.textContent;
      _buffer.delete(chave);
      console.log("[Webhook] PAIRED: imagem + texto do buffer de", senderJid);
    } else {
      // Sem texto casando: entra na fila e aguarda.
      const base =
        guardado ?? { imageUrls: [] as string[], messageId, senderJid: senderJid as string, timestamp: Date.now() };
      const urls = base.imageUrls ?? [];
      if (!urls.includes(imageUrl)) urls.push(imageUrl);
      _buffer.set(chave, {
        ...base,
        imageUrls: urls.slice(0, MAX_FOTOS),
        timestamp: Date.now(), // refresca o TTL
      });
      console.log(`[Webhook] BUFFERED: imagem #${urls.length} de`, senderJid);
      return {
        tipo: "bufferado",
        resposta: { status: "buffered", reason: "awaiting_caption", queued: urls.length },
      };
    }
  } else if (!imageUrl && textContent && chave) {
    if (guardado?.imageUrls && guardado.imageUrls.length > 0 && !guardado.textContent) {
      // Texto chegou e havia fotos esperando: a primeira vira a principal e o
      // resto forma o album.
      imageUrl = guardado.imageUrls[0];
      fotosExtras = guardado.imageUrls.slice(1);
      _buffer.delete(chave);
      console.log(
        `[Webhook] PAIRED: texto + ${guardado.imageUrls.length} imagem(s) do buffer de`,
        senderJid,
        fotosExtras.length > 0 ? `(${fotosExtras.length} extras pro album)` : ""
      );
    } else if (guardado?.textContent) {
      // Ja havia texto: concatena (anuncio fragmentado em varias mensagens).
      const combinado = `${guardado.textContent}\n${textContent}`.slice(0, MAX_CHARS_TEXTO);
      _buffer.set(chave, { ...guardado, textContent: combinado, timestamp: Date.now() });
      console.log(
        `[Webhook] BUFFERED: texto concatenado (${combinado.length} chars total) de`,
        senderJid
      );
      return {
        tipo: "bufferado",
        resposta: { status: "buffered", reason: "text_concatenated", chars: combinado.length },
      };
    } else if (textContent.length >= 5) {
      // Guarda fragmentos curtos ("Onix LT", "2020", "50k"): serao unidos
      // quando a foto chegar, ou descartados pelo TTL.
      _buffer.set(chave, {
        imageUrls: [],
        textContent,
        messageId,
        senderJid: senderJid as string,
        timestamp: Date.now(),
      });
      console.log(
        `[Webhook] BUFFERED: texto aguardando imagem (${textContent.length} chars) de`,
        senderJid
      );
      return { tipo: "bufferado", resposta: { status: "buffered", reason: "awaiting_image" } };
    }
  }

  return { tipo: "segue", textContent, imageUrl, fotosExtras };
}
