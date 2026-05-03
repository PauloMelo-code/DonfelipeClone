import crypto from "crypto";

/**
 * SHA256 hash of image bytes (works for exact-match duplicate detection).
 * For data URIs, hash the base64 part.
 */
export function hashPhoto(photoUrl: string): string | null {
  if (!photoUrl) return null;
  let bytes: string;
  if (photoUrl.startsWith("data:")) {
    const idx = photoUrl.indexOf(",");
    if (idx === -1) return null;
    bytes = photoUrl.substring(idx + 1);
  } else {
    bytes = photoUrl;
  }
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
