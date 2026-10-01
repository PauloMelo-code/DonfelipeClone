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
  /**
   * Album aberto: o texto veio ANTES e ja casou com a primeira foto. As fotos
   * seguintes sao desse carro, nao do proximo anuncio. `veiculoId` fica nulo
   * enquanto o carro ainda esta sendo gravado; ate la as fotos esperam aqui.
   */
  album?: { fotos: string[]; veiculoId: string | null; ate: number };
}

const _buffer = new Map<string, MensagemBufferizada>();
const TTL_MS = 5 * 60 * 1000; // 5 min -- vendedor demora a mandar tudo
const MAX_FOTOS = 12;
const MAX_CHARS_TEXTO = 2000;
/**
 * Quanto tempo o album fica aberto, contado da mensagem que fechou o anuncio.
 * Album do WhatsApp chega em rajada, em segundos. Passado isso, foto nova e
 * do PROXIMO carro -- album sem prazo pegava a foto do anuncio seguinte de
 * quem posta foto antes do texto.
 */
const ALBUM_MS = 2 * 60 * 1000;

function abrirAlbum(chave: string, messageId: string, senderJid: string) {
  const agora = Date.now();
  _buffer.set(chave, {
    imageUrls: [],
    messageId,
    senderJid,
    timestamp: agora,
    album: { fotos: [], veiculoId: null, ate: agora + ALBUM_MS },
  });
}

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
      /** Foto sem legenda de um album aberto: vai pra ESTE carro, e so pra ele. */
      veiculoDoAlbum?: string;
    }
  | { tipo: "bufferado"; resposta: Record<string, unknown> };

export function parear(entrada: EntradaPareamento): ResultadoPareamento {
  const { groupJid, senderJid, messageId } = entrada;
  let { textContent, imageUrl } = entrada;
  let fotosExtras: string[] = [];

  limparExpirados();
  const chave = chaveDoBuffer(groupJid, senderJid);
  const noBuffer = chave ? _buffer.get(chave) : null;
  // Album vencido nao segura mais nada: a foto que chega e de outro carro.
  const guardado = noBuffer?.album && Date.now() >= noBuffer.album.ate ? null : noBuffer;

  if (imageUrl && !textContent && chave) {
    if (guardado?.album) {
      // Mais uma foto do carro cujo texto veio antes. Antes disto ela ficava
      // esperando legenda e ia parar no PROXIMO anuncio do vendedor: HB20S
      // com as fotos do HR-V postado antes (cliente, 30/09/2026).
      guardado.timestamp = Date.now();
      if (guardado.album.veiculoId) {
        return { tipo: "segue", textContent: null, imageUrl, fotosExtras, veiculoDoAlbum: guardado.album.veiculoId };
      }
      if (!guardado.album.fotos.includes(imageUrl) && guardado.album.fotos.length < MAX_FOTOS) {
        guardado.album.fotos.push(imageUrl);
      }
      return { tipo: "bufferado", resposta: { status: "buffered", reason: "awaiting_vehicle" } };
    }
    if (guardado?.textContent && (!guardado.imageUrls || guardado.imageUrls.length === 0)) {
      // Texto ja estava esperando esta foto: pareia.
      textContent = guardado.textContent;
      abrirAlbum(chave, messageId, senderJid as string);
      console.log("[Webhook] PAIRED: imagem + texto do buffer de", senderJid);
    } else {
      // Sem texto casando: entra na fila e aguarda.
      const base =
        guardado ?? { imageUrls: [] as string[], messageId, senderJid: senderJid as string, timestamp: Date.now() };
      const urls = base.imageUrls ?? [];
      if (!urls.includes(imageUrl)) urls.push(imageUrl);
      // O prazo conta da PRIMEIRA foto e nao se renova: renovado, uma foto
      // velha sobrevivia enquanto o vendedor postasse e ia parar num carro de
      // muito depois -- Corolla com a foto de uma SW4 (cliente, 01/10/2026).
      _buffer.set(chave, { ...base, imageUrls: urls.slice(0, MAX_FOTOS) });
      console.log(`[Webhook] BUFFERED: imagem #${urls.length} de`, senderJid);
      return {
        tipo: "bufferado",
        resposta: { status: "buffered", reason: "awaiting_caption", queued: urls.length },
      };
    }
  } else if (imageUrl && textContent && chave) {
    // Foto COM legenda fecha o anuncio na hora. As fotos sem legenda que
    // vieram antes sao do mesmo album (legenda na ultima foto); as que vierem
    // logo depois tambem (legenda na primeira). Antes, as de depois esperavam
    // texto e iam parar no proximo anuncio do vendedor.
    if (guardado?.imageUrls?.length && !guardado.textContent) {
      fotosExtras = guardado.imageUrls.filter((u) => u !== imageUrl);
    }
    abrirAlbum(chave, messageId, senderJid as string);
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

/**
 * O carro do album aberto foi gravado: devolve as fotos que chegaram enquanto
 * isso, e as proximas vao direto pro album dele.
 */
export function fotosQueChegaramDepois(groupJid: string, senderJid: string | null, veiculoId: string): string[] {
  const guardado = _buffer.get(chaveDoBuffer(groupJid, senderJid));
  if (!guardado?.album || guardado.album.veiculoId) return [];
  guardado.album.veiculoId = veiculoId;
  return guardado.album.fotos.splice(0);
}
