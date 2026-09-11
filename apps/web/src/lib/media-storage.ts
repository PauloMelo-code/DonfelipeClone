import { randomUUID } from "crypto";
import https from "https";
import http from "http";
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
const MAX_REDIRECTS = 5;

async function downloadImage(
  url: string,
  timeout = 15000,
  redirectCount = 0
): Promise<ImageData | null> {
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
        downloadImage(proxima, timeout, redirectCount + 1).then(resolve);
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
        const buffer = Buffer.concat(chunks);
        let mimeType = res.headers["content-type"] || "image/jpeg";
        // WhatsApp CDN often returns application/octet-stream for images
        if (mimeType === "application/octet-stream" || mimeType.startsWith("application/")) {
          mimeType = "image/jpeg";
        }
        resolve({
          base64: buffer.toString("base64"),
          mimeType,
        });
      });
      res.on("error", () => resolve(null));
      }
    );

    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
  });
}
