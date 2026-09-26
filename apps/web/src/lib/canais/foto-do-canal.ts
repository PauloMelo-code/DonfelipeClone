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

/** O endereco do arquivo, do jeito que o cliente do WhatsApp o pede. */
function enderecoDoArquivo(midia: MidiaDaPublicacao): string | null {
  if (midia.url) return midia.url;
  if (!midia.directPath) return null;
  const u = new URL(`https://mmg.whatsapp.net${midia.directPath}`);
  // O cliente do WhatsApp sempre acrescenta isto; sem o parametro o CDN
  // costuma responder 404.
  u.searchParams.set("mms3", "true");
  return u.toString();
}

export interface FotoResolvida {
  /** A imagem pronta pra guardar, como data URI. */
  dataUri: string;
  /** Como ela foi obtida -- aparece no diagnostico do giro. */
  origem: "decifrada" | "miniatura";
}

/**
 * A foto da publicacao, pronta pra entrar no anuncio.
 *
 * Tenta o arquivo cheio primeiro; sem chave ou sem sucesso, cai na miniatura.
 * Devolve `null` quando nao ha nenhuma das duas.
 */
export async function fotoDaPublicacao(
  midia: MidiaDaPublicacao | null | undefined
): Promise<FotoResolvida | null> {
  if (!midia) return null;

  const endereco = enderecoDoArquivo(midia);
  if (midia.mediaKey && endereco) {
    const arquivo = await baixarBytes(endereco);
    if (arquivo) {
      const aberta = decifrarImagem(arquivo, midia.mediaKey);
      if (aberta) {
        const tipo = tipoDaImagem(aberta) ?? "image/jpeg";
        return { dataUri: `data:${tipo};base64,${aberta.toString("base64")}`, origem: "decifrada" };
      }
      console.warn(`[Canais] nao consegui decifrar a foto (${arquivo.length} bytes)`);
    }
  }

  if (midia.miniatura) {
    const bytes = Buffer.from(midia.miniatura, "base64");
    const tipo = tipoDaImagem(bytes);
    if (tipo) {
      return { dataUri: `data:${tipo};base64,${midia.miniatura}`, origem: "miniatura" };
    }
  }

  return null;
}
