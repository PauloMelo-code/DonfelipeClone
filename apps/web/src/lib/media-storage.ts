import { randomUUID } from "crypto";
import https from "https";
import http from "http";
import { eq } from "drizzle-orm";
import { db, arquivosMidia } from "./db";
import { verificarUrlExterna, lookupFixo } from "./url-guard";

/**
 * Downloads an image from a URL and stores it as base64 in the database.
 * Returns a persistent local URL like /api/media/<id>.
 * Falls back to the original URL if download fails.
 */
export async function persistImage(originalUrl: string): Promise<string> {
  // Already a local URL
  if (originalUrl.startsWith("/api/media/")) {
    return originalUrl;
  }

  // Data URI (base64) — save directly to database
  if (originalUrl.startsWith("data:")) {
    try {
      const match = originalUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const id = randomUUID();
        await db
          .insert(arquivosMidia)
          .values({ id, mimeType: match[1], data: match[2] });
        return `/api/media/${id}`;
      }
    } catch (err) {
      console.error("[MediaStorage] Failed to persist data URI:", err);
    }
    return originalUrl;
  }

  try {
    const imageData = await downloadImage(originalUrl);
    if (!imageData) return originalUrl;

    const id = randomUUID();
    await db.insert(arquivosMidia).values({
      id,
      mimeType: imageData.mimeType,
      data: imageData.base64,
      originalUrl,
    });

    return `/api/media/${id}`;
  } catch (err) {
    console.error("[MediaStorage] Failed to persist image:", err);
    return originalUrl;
  }
}

/**
 * Conserta a foto de um anuncio ja capturado.
 *
 * Card de canal ficou com a foto quebrada quando o download falhava (a URL
 * crua era guardada) ou quando a resposta nao era imagem (guardada como JPEG
 * mesmo assim). As duas coisas ja nao acontecem mais na captura, mas os
 * registros antigos continuam quebrados -- e o unico botao que o operador tem
 * pra esses cards e o "Regerar".
 *
 * Devolve a mesma url quando nao ha nada a consertar, ou quando o conserto
 * falhou: perder a foto seria pior.
 */
export async function repararFoto(url: string): Promise<string> {
  if (url.startsWith("http")) return persistImage(url);
  if (!url.startsWith("/api/media/")) return url;

  const id = url.slice("/api/media/".length);
  const [arquivo] = await db.select().from(arquivosMidia).where(eq(arquivosMidia.id, id)).limit(1);
  if (!arquivo?.originalUrl) return url;
  // Ja e imagem de verdade? Entao nao ha o que consertar.
  if (tipoDaImagem(Buffer.from(arquivo.data, "base64"))) return url;

  console.warn(`[MediaStorage] Foto guardada nao e imagem, baixando de novo: ${id}`);
  const nova = await persistImage(arquivo.originalUrl);
  return nova === arquivo.originalUrl ? url : nova;
}

/**
 * Persist multiple images concurrently.
 */
export async function persistImages(urls: string[]): Promise<string[]> {
  return Promise.all(urls.map((url) => persistImage(url)));
}

interface ImageData {
  base64: string;
  mimeType: string;
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * O tipo pela assinatura dos bytes, nao pelo cabecalho: o CDN do WhatsApp
 * responde `application/octet-stream`. Nao e imagem (pagina de erro, arquivo
 * cifrado): null -- guardar isso vira foto quebrada no card.
 */
export function tipoDaImagem(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  if (b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (b.subarray(4, 8).toString("ascii") === "ftyp") {
    const marca = b.subarray(8, 12).toString("ascii");
    if (/^(heic|heix|hevc|mif1|msf1)$/.test(marca)) return "image/heic";
    if (/^avi[fs]$/.test(marca)) return "image/avif";
  }
  return null;
}
const MAX_REDIRECTS = 5;

/**
 * Os bytes crus de uma URL externa, com a guarda de SSRF revalidada a cada
 * redirecionamento.
 *
 * Separada de `downloadImage` porque a foto de CANAL chega cifrada: ela
 * precisa dos bytes ANTES de qualquer conferencia de que e imagem -- a
 * conferencia vale depois de decifrar.
 */
export async function baixarBytes(
  url: string,
  timeout = 15000,
  redirectCount = 0
): Promise<Buffer | null> {
  if (redirectCount >= MAX_REDIRECTS) {
    console.warn(`[MediaStorage] Too many redirects (${MAX_REDIRECTS}) for ${url.substring(0, 80)}`);
    return null;
  }

  // Guarda de SSRF ANTES de cada request, inclusive apos redirecionamento:
  // sem revalidar, bastava um 302 para a rede interna para o primeiro teste
  // virar decoracao.
  const destino = await verificarUrlExterna(url);
  if (!destino.ok) {
    console.warn(
      `[MediaStorage] URL recusada (${destino.motivo}): ${url.substring(0, 80)}`
    );
    return null;
  }

  return new Promise((resolve) => {
    const client = url.startsWith("https") ? https : http;

    const req = client.get(
      url,
      { timeout, lookup: lookupFixo(destino.endereco, destino.familia) },
      (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Redirecionamento: resolve relativo e revalida na chamada recursiva.
        let proxima: string;
        try {
          proxima = new URL(res.headers.location, url).toString();
        } catch {
          resolve(null);
          return;
        }
        res.destroy();
        baixarBytes(proxima, timeout, redirectCount + 1).then(resolve);
        return;
      }

      if (res.statusCode !== 200) {
        console.warn(`[MediaStorage] HTTP ${res.statusCode} for ${url.substring(0, 80)}`);
        resolve(null);
        return;
      }

      // Check Content-Length header upfront
      const contentLength = parseInt(res.headers["content-length"] || "0", 10);
      if (contentLength > MAX_IMAGE_SIZE) {
        console.warn(`[MediaStorage] Content-Length ${contentLength} exceeds ${MAX_IMAGE_SIZE} for ${url.substring(0, 80)}`);
        res.destroy();
        resolve(null);
        return;
      }

      const chunks: Buffer[] = [];
      let totalSize = 0;
      res.on("data", (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > MAX_IMAGE_SIZE) {
          console.warn(`[MediaStorage] Download exceeded ${MAX_IMAGE_SIZE} bytes, aborting ${url.substring(0, 80)}`);
          res.destroy();
          resolve(null);
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        if (totalSize > MAX_IMAGE_SIZE) return; // already resolved null
        resolve(Buffer.concat(chunks));
      });
      // Conexao derrubada no meio do corpo, TLS reset, resposta truncada: sem
      // esta linha a foto sumia sem deixar nada no log.
      res.on("error", (e) => {
        console.warn(`[MediaStorage] Erro ao ler a resposta (${e.message}): ${url.substring(0, 80)}`);
        resolve(null);
      });
      }
    );

    // Falha de rede era silenciosa: o card ficava com a URL crua e ninguem
    // sabia por que. Agora aparece no log.
    req.on("timeout", () => {
      console.warn(`[MediaStorage] Timeout ${timeout}ms: ${url.substring(0, 80)}`);
      req.destroy();
      resolve(null);
    });
    req.on("error", (e) => {
      console.warn(`[MediaStorage] Erro de rede (${(e as NodeJS.ErrnoException).code ?? e.message}): ${url.substring(0, 80)}`);
      resolve(null);
    });
  });
}

/** Os bytes, ja conferidos como imagem de verdade. */
async function downloadImage(url: string, timeout = 15000): Promise<ImageData | null> {
  const buffer = await baixarBytes(url, timeout);
  if (!buffer) return null;
  const mimeType = tipoDaImagem(buffer);
  if (!mimeType) {
    console.warn(
      `[MediaStorage] Resposta nao e imagem (${buffer.length} bytes): ${url.substring(0, 80)}`
    );
    return null;
  }
  return { base64: buffer.toString("base64"), mimeType };
}
