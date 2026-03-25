import { randomUUID } from "crypto";
import https from "https";
import http from "http";
import { prisma } from "./prisma";

/**
 * Downloads an image from a URL and stores it as base64 in the database.
 * Returns a persistent local URL like /api/media/<id>.
 * Falls back to the original URL if download fails.
 */
export async function persistImage(originalUrl: string): Promise<string> {
  // Already a local URL or data URI
  if (originalUrl.startsWith("/api/media/") || originalUrl.startsWith("data:")) {
    return originalUrl;
  }

  try {
    const imageData = await downloadImage(originalUrl);
    if (!imageData) return originalUrl;

    const id = randomUUID();
    await prisma.mediaFile.create({
      data: {
        id,
        mimeType: imageData.mimeType,
        data: imageData.base64,
        originalUrl,
      },
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

function downloadImage(url: string, timeout = 15000): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const client = url.startsWith("https") ? https : http;

    const req = client.get(url, { timeout }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        downloadImage(res.headers.location, timeout).then(resolve);
        return;
      }

      if (res.statusCode !== 200) {
        console.warn(`[MediaStorage] HTTP ${res.statusCode} for ${url.substring(0, 80)}`);
        resolve(null);
        return;
      }

      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
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
    });

    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
  });
}
