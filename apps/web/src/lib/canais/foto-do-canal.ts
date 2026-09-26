import { createDecipheriv, hkdfSync } from "node:crypto";
import { baixarBytes, tipoDaImagem } from "@/lib/media-storage";
import type { MidiaDaPublicacao } from "@/lib/uazapi";

// ---------------------------------------------------------------------------
// A foto de uma publicacao de canal.
//
// Canal nao chega por webhook: o sistema vai buscar. E a UAZAPI NAO entrega a
// midia de canal pelo id da publicacao -- medido nos quatro canais do cliente
// em 26/09/2026, os quatro responderam vazio. O que ela manda e o endereco do
// arquivo no CDN do WhatsApp, e o que esta la e CIFRADO: baixar aquilo e
// guardar dava uma foto quebrada no card.
//
// Entao a decifragem acontece aqui. E o esquema publico do WhatsApp: a
// `mediaKey` da publicacao vira, por HKDF, o vetor inicial e a chave AES do
// arquivo. Os ultimos 10 bytes sao a assinatura, nao fazem parte da imagem.
//
// Sem `mediaKey` nao ha o que decifrar -- e dois dos canais do cliente vem
// sem ela. Para esses fica a miniatura que o proprio payload carrega: e
// pequena, mas e uma foto de verdade e deixa o operador ver o carro.
// ---------------------------------------------------------------------------

/** Rotulo do HKDF. Muda por tipo de midia; aqui so tratamos imagem. */
const INFO_DA_IMAGEM = "WhatsApp Image Keys";
/** A assinatura no fim do arquivo cifrado. */
const BYTES_DE_ASSINATURA = 10;

/**
 * Decifra o arquivo do CDN com a chave da publicacao.
 *
 * Devolve `null` quando o resultado nao e imagem -- chave errada, arquivo
 * truncado ou formato que nao conhecemos. Melhor nenhuma foto do que uma
 * foto quebrada no anuncio.
 */
export function decifrarImagem(arquivo: Buffer, mediaKeyBase64: string): Buffer | null {
  try {
    const mediaKey = Buffer.from(mediaKeyBase64, "base64");
    if (mediaKey.length === 0) return null;

    const derivada = Buffer.from(
      hkdfSync("sha256", mediaKey, Buffer.alloc(32), INFO_DA_IMAGEM, 112)
    );
    const iv = derivada.subarray(0, 16);
    const chave = derivada.subarray(16, 48);

    const cifrado = arquivo.subarray(0, arquivo.length - BYTES_DE_ASSINATURA);
    if (cifrado.length === 0) return null;

    const decifrador = createDecipheriv("aes-256-cbc", chave, iv);
    const aberto = Buffer.concat([decifrador.update(cifrado), decifrador.final()]);
    return tipoDaImagem(aberto) ? aberto : null;
  } catch {
    // Chave errada estoura no `final()` pelo padding. Nao e excecao: e o
    // caminho normal de "nao deu".
    return null;
  }
}

/**
 * Os enderecos possiveis do arquivo, em ordem de tentativa.
 *
 * O `URL` que a UAZAPI manda nem sempre serve; o caminho montado a partir do
 * `directPath` leva `mms3=true`, que e o que o cliente do WhatsApp sempre
 * acrescenta -- sem ele o CDN costuma responder 404.
 */
function enderecosDoArquivo(midia: MidiaDaPublicacao): string[] {
  const enderecos: string[] = [];
  if (midia.url) enderecos.push(midia.url);
  if (midia.directPath) {
    const u = new URL(`https://mmg.whatsapp.net${midia.directPath}`);
    u.searchParams.set("mms3", "true");
    const comParametro = u.toString();
    if (!enderecos.includes(comParametro)) enderecos.push(comParametro);
  }
  return enderecos;
}

/** Onde a tentativa do arquivo cheio parou -- aparece no diagnostico do giro. */
export interface TentativaDoArquivo {
  enderecos: number;
  /** Bytes baixados na melhor tentativa; 0 = nenhum endereco respondeu. */
  bytes: number;
  /** O arquivo baixado ja era imagem, sem precisar decifrar. */
  jaEraImagem: boolean;
  /** Tinha chave e a decifragem abriu a imagem. */
  decifrou: boolean;
  /** Havia `mediaKey` pra tentar decifrar. */
  temChave: boolean;
}

export interface FotoResolvida {
  /** A imagem pronta pra guardar, como data URI. */
  dataUri: string;
  /** Como ela foi obtida -- aparece no diagnostico do giro. */
  origem: "arquivo" | "decifrada" | "miniatura";
  /** So quando caiu na miniatura: por que o arquivo cheio nao veio. */
  tentativa?: TentativaDoArquivo;
}

/**
 * A foto da publicacao, pronta pra entrar no anuncio.
 *
 * Na ordem: o arquivo como veio (a UAZAPI as vezes ja entrega em claro), o
 * arquivo decifrado com a chave da publicacao, e por fim a miniatura do
 * payload. Devolve `null` quando nao ha nenhuma das tres.
 */
export async function fotoDaPublicacao(
  midia: MidiaDaPublicacao | null | undefined
): Promise<FotoResolvida | null> {
  if (!midia) return null;

  const enderecos = enderecosDoArquivo(midia);
  const tentativa: TentativaDoArquivo = {
    enderecos: enderecos.length,
    bytes: 0,
    jaEraImagem: false,
    decifrou: false,
    temChave: !!midia.mediaKey,
  };

  for (const endereco of enderecos) {
    const arquivo = await baixarBytes(endereco);
    if (!arquivo) continue;
    tentativa.bytes = Math.max(tentativa.bytes, arquivo.length);

    // 1. Ja veio em claro? Foi o caso medido em 26/09/2026: o arquivo baixava
    //    inteiro (285 KB) e a decifragem falhava -- porque nao havia nada pra
    //    decifrar. Conferir isto ANTES custa uma leitura de 12 bytes.
    const tipoDireto = tipoDaImagem(arquivo);
    if (tipoDireto) {
      tentativa.jaEraImagem = true;
      return {
        dataUri: `data:${tipoDireto};base64,${arquivo.toString("base64")}`,
        origem: "arquivo",
      };
    }

    // 2. Cifrado: abre com a chave da publicacao.
    if (midia.mediaKey) {
      const aberta = decifrarImagem(arquivo, midia.mediaKey);
      if (aberta) {
        tentativa.decifrou = true;
        const tipo = tipoDaImagem(aberta) ?? "image/jpeg";
        return {
          dataUri: `data:${tipo};base64,${aberta.toString("base64")}`,
          origem: "decifrada",
        };
      }
    }
  }

  if (tentativa.bytes > 0) {
    console.warn(
      `[Canais] baixei ${tentativa.bytes} bytes e nao virou imagem` +
        (midia.mediaKey ? " (nem em claro, nem decifrando)" : " (e nao havia chave pra decifrar)")
    );
  } else if (enderecos.length > 0) {
    console.warn(`[Canais] nenhum dos ${enderecos.length} endereco(s) da foto respondeu`);
  }

  if (midia.miniatura) {
    const bytes = Buffer.from(midia.miniatura, "base64");
    const tipo = tipoDaImagem(bytes);
    if (tipo) {
      return {
        dataUri: `data:${tipo};base64,${midia.miniatura}`,
        origem: "miniatura",
        tentativa,
      };
    }
  }

  return null;
}
