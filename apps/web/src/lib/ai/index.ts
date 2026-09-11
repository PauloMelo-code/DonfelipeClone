import OpenAI from "openai";
import { geminiGenerateText, isGeminiConfigured } from "../gemini";
import type { VehicleData } from "./tipos";
import { extractWithRegex } from "./regex";
import { extractKmFromText } from "./numeros";
import {
  EXTRACTION_SYSTEM_PROMPT,
  VEHICLE_JSON_SCHEMA,
  parseGptResponse,
  isModelLikelyBad,
} from "./prompt";

export type { VehicleData } from "./tipos";
export { extractKmFromText } from "./numeros";

// ---------------------------------------------------------------------------
// Extracao de veiculo a partir do anuncio.
//
// A ordem importa e e economica: regex primeiro (gratis), GPT depois (pago),
// Gemini como rede quando o GPT falha ou devolve modelo suspeito.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// OpenAI Client (fallback only)
// ---------------------------------------------------------------------------

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const CACHE_MAX = 500;
const CACHE_TTL = 30 * 60 * 1000;
const _cache = new Map<string, { data: VehicleData | null; ts: number }>();

function cacheKey(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 500);
  let h = 0;
  for (let i = 0; i < normalized.length; i++) {
    h = ((h << 5) - h + normalized.charCodeAt(i)) | 0;
  }
  return String(h);
}

function getCached(text: string): VehicleData | null | undefined {
  const key = cacheKey(text);
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(key); return undefined; }
  console.log("[ai] Cache hit");
  return entry.data;
}

function setCache(text: string, data: VehicleData | null): void {
  if (!data) return; // Do not pollute cache with negative results
  const key = cacheKey(text);
  _cache.set(key, { data, ts: Date.now() });
  if (_cache.size > CACHE_MAX) {
    const firstKey = _cache.keys().next().value;
    if (firstKey !== undefined) _cache.delete(firstKey);
  }
}

// ---------------------------------------------------------------------------
// GPT Extraction (fallback)
// ---------------------------------------------------------------------------

async function extractWithGemini(text: string): Promise<VehicleData | null> {
  if (!isGeminiConfigured()) return null;
  // Gemini nao tem response_format strict como o GPT, mas suporta JSON mode.
  // Vou pedir JSON explicito no prompt + jsonMode=true.
  const userPrompt = `${text}\n\nResponda APENAS com JSON no formato pedido (sem markdown, sem aspas envolvendo).`;
  const raw = await geminiGenerateText(EXTRACTION_SYSTEM_PROMPT, userPrompt, {
    jsonMode: true,
    maxTokens: 1000,
    temperature: 0.1,
  });
  if (!raw) return null;
  const parsed = parseGptResponse(raw);
  return parsed ? validateAndFix(parsed, text) : null;
}

async function extractWithGPT(text: string): Promise<VehicleData | null> {
  if (!process.env.OPENAI_API_KEY) {
    // GPT nao configurado -- tenta Gemini direto
    return extractWithGemini(text);
  }
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4.1-mini", temperature: 0.1,
      response_format: { type: "json_schema", json_schema: VEHICLE_JSON_SCHEMA },
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) {
      console.warn("[ai] GPT retornou vazio, tentando Gemini");
      return extractWithGemini(text);
    }
    const parsed = parseGptResponse(content);
    if (!parsed) {
      console.warn("[ai] GPT retornou JSON invalido, tentando Gemini");
      return extractWithGemini(text);
    }
    // Validacao semantica: se modelo virou chamada/loja, GPT errou -> Gemini
    if (isModelLikelyBad(parsed.model)) {
      console.warn(`[ai] GPT retornou modelo suspeito ("${parsed.model}"), tentando Gemini`);
      const geminiResult = await extractWithGemini(text);
      if (geminiResult && !isModelLikelyBad(geminiResult.model)) {
        console.log(`[ai] Gemini corrigiu modelo: "${parsed.model}" -> "${geminiResult.model}"`);
        return validateAndFix(geminiResult, text);
      }
    }
    return validateAndFix(parsed, text);
  } catch (error) {
    console.error("[ai] GPT extraction failed:", error);
    const fallback = await extractWithGemini(text);
    if (fallback) console.log("[ai] Gemini fallback sucesso");
    return fallback;
  }
}


/**
 * Aplica validacoes cruzadas sobre o resultado extraido.
 * Hoje cobre: KM suspeito (< 1000) quando texto tem CV/HP -> tenta regex.
 */
function validateAndFix(parsed: VehicleData, text: string): VehicleData {
  if (parsed.km != null && parsed.km < 1000 && /\b(cv|hp|cavalos)\b/i.test(text)) {
    const regexKm = extractKmFromText(text);
    if (regexKm !== null && regexKm >= 1000) {
      console.warn(`[ai] GPT retornou km=${parsed.km} suspeito (texto tem CV/HP); usando regex=${regexKm}`);
      parsed.km = regexKm;
    }
  }
  return parsed;
}

/**
 * Re-extrai veiculo SEM cache. Usado pelo endpoint admin que corrige
 * modelos errados de carros ja capturados (queremos rodar o extractor
 * com a regra/prompt NOVOS, nao retornar resultado antigo do cache).
 */
export async function extractVehicleFromTextNoCache(text: string): Promise<VehicleData | null> {
  const regexResult = extractWithRegex(text);
  if (regexResult) return validateAndFix(regexResult, text);
  const gptResult = await extractWithGPT(text);
  if (gptResult) {
    gptResult.rawDescription = text;
    return validateAndFix(gptResult, text);
  }
  return gptResult;
}

export async function extractVehicleFromText(
  text: string
): Promise<VehicleData | null> {
  const cached = getCached(text);
  if (cached !== undefined) return cached;

  // 1. Try regex first (FREE)
  const regexResult = extractWithRegex(text);
  if (regexResult) {
    console.log("[ai] Regex extraction succeeded for:", regexResult.model);
    const validated = validateAndFix(regexResult, text);
    setCache(text, validated);
    return validated;
  }

  // 2. Fallback to GPT if regex failed and AI is enabled
  console.log("[ai] Regex failed, trying GPT fallback...");
  const gptResult = await extractWithGPT(text);
  if (gptResult) {
    gptResult.rawDescription = text;
    setCache(text, gptResult);
    return gptResult;
  }

  setCache(text, null);
  return null;
}

/**
 * Extract vehicle data from image + optional caption.
 * Strategy: If caption exists, use text extraction (regex → GPT).
 * Only uses vision API as last resort.
 */
export async function extractVehicleFromImage(
  imageUrl: string,
  caption?: string
): Promise<VehicleData | null> {
  // If we have a caption, extract from text (regex first, then GPT)
  if (caption && caption.length > 15) {
    const vehicle = await extractVehicleFromText(caption);
    if (vehicle) {
      vehicle.photos = [imageUrl];
      return vehicle;
    }
  }

  // No caption or extraction failed — try vision as last resort
  if (!process.env.OPENAI_API_KEY) return null;

  try {
    let visionUrl = imageUrl;
    if (imageUrl.startsWith("/api/media/")) {
      const mediaId = imageUrl.replace("/api/media/", "");
      const { db, arquivosMidia, vivosE } = await import("../db");
      const { eq } = await import("drizzle-orm");
      const [media] = await db
        .select({ mimeType: arquivosMidia.mimeType, data: arquivosMidia.data })
        .from(arquivosMidia)
        .where(vivosE(arquivosMidia, eq(arquivosMidia.id, mediaId)))
        .limit(1);
      if (media) {
        const mimeType = media.mimeType === "application/octet-stream" ? "image/jpeg" : media.mimeType;
        visionUrl = `data:${mimeType};base64,${media.data}`;
      }
    }

    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: "image_url", image_url: { url: visionUrl, detail: "low" } },
    ];
    if (caption) {
      userContent.push({ type: "text", text: `Legenda: ${caption}` });
    }

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4.1-mini", temperature: 0.1,
      response_format: { type: "json_schema", json_schema: VEHICLE_JSON_SCHEMA },
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return null;

    const vehicle = parseGptResponse(content);
    if (vehicle) {
      vehicle.rawDescription = caption ?? undefined;
      vehicle.photos = [imageUrl];
    }
    return vehicle;
  } catch (error) {
    console.error("[ai] Vision extraction failed:", error);
    return null;
  }
}
