import OpenAI from "openai";
import { geminiGenerateText, isGeminiConfigured } from "../gemini";
import type { VehicleData } from "./tipos";
import { extractWithRegex } from "./regex";
import { cambioConfirmado, combustivelConfirmado } from "./cambio";
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
  // "450HP" colado no numero tambem e potencia.
  if (parsed.km != null && parsed.km < 1000 && /\d\s*(cv|hp)\b|\b(cv|hp|cavalos)\b/i.test(text)) {
    const regexKm = extractKmFromText(text);
    if (regexKm !== null && regexKm >= 1000) {
      console.warn(`[ai] GPT retornou km=${parsed.km} suspeito (texto tem CV/HP); usando regex=${regexKm}`);
      parsed.km = regexKm;
    }
  }
  // "97km" em carro usado e 97 mil: ninguem repassa uma Hilux 2022 com 97 km.
  // Carro do ano corrente fica como veio -- ali km baixo pode ser real.
  const anoAtual = new Date().getFullYear();
  if (parsed.km != null && parsed.km > 0 && parsed.km < 1000 && parsed.year && parsed.year < anoAtual) {
    console.warn(`[ai] km=${parsed.km} num carro de ${parsed.year}: lendo como ${parsed.km * 1000}`);
    parsed.km *= 1000;
  }
  return parsed;
}

/**
 * Re-extrai veiculo SEM cache. Usado pelo endpoint admin que corrige
 * modelos errados de carros ja capturados (queremos rodar o extractor
 * com a regra/prompt NOVOS, nao retornar resultado antigo do cache).
 */
// ---------------------------------------------------------------------------
// Cambio pelo modelo
//
// Muito anuncio nao diz o cambio ("A45 AMG 2.0T 4MATIC"), e o titulo padrao
// termina nele. Quando o texto nao diz, pergunta se aquele modelo e versao SO
// existem com um cambio no Brasil. Se existir mais de um, fica sem.
// ---------------------------------------------------------------------------

const CAMBIO_PROMPT = `Voce conhece o mercado brasileiro de carros. Recebe marca, modelo e versao de um anuncio.
Responda com UMA palavra, sem pontuacao:
- AUTOMATICO, MANUAL ou CVT, somente se TODAS as unidades desse modelo e versao vendidas no Brasil tiverem esse cambio (ex.: eletricos, AMG, Porsche, Compass, Corolla Cross -> AUTOMATICO);
- DESCONHECIDO, se o mesmo modelo e versao existir com cambios diferentes ou se voce nao tiver certeza.`;

const _cacheCambio = new Map<string, string | null>();

async function inferirCambio(modelo: string, marca?: string): Promise<string | undefined> {
  if (!process.env.OPENAI_API_KEY || !modelo) return undefined;
  const chave = `${marca ?? ""} ${modelo}`.trim().toUpperCase();
  if (_cacheCambio.has(chave)) return _cacheCambio.get(chave) ?? undefined;
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4.1-mini", temperature: 0,
      messages: [
        { role: "system", content: CAMBIO_PROMPT },
        { role: "user", content: chave },
      ],
    });
    const resposta = (completion.choices[0]?.message?.content ?? "").trim().toUpperCase();
    const cambio = ["AUTOMATICO", "MANUAL", "CVT"].includes(resposta) ? resposta : null;
    if (_cacheCambio.size >= CACHE_MAX) _cacheCambio.clear();
    _cacheCambio.set(chave, cambio);
    return cambio ?? undefined;
  } catch (erro) {
    console.warn("[ai] Inferencia de cambio falhou:", erro instanceof Error ? erro.message : erro);
    return undefined;
  }
}

async function completarCambio(v: VehicleData | null, text: string): Promise<VehicleData | null> {
  if (!v) return v;
  if (!v.transmission) v.transmission = await inferirCambio(v.model, v.brand);
  v.transmission = cambioConfirmado(v.transmission, text);
  v.fuel = combustivelConfirmado(v.fuel, text);
  return v;
}

export async function extractVehicleFromTextNoCache(text: string): Promise<VehicleData | null> {
  const regexResult = extractWithRegex(text);
  if (regexResult) return completarCambio(validateAndFix(regexResult, text), text);
  const gptResult = await extractWithGPT(text);
  if (gptResult) {
    gptResult.rawDescription = text;
    return completarCambio(validateAndFix(gptResult, text), text);
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
    const validated = await completarCambio(validateAndFix(regexResult, text), text);
    setCache(text, validated);
    return validated;
  }

  // 2. Fallback to GPT if regex failed and AI is enabled
  console.log("[ai] Regex failed, trying GPT fallback...");
  const gptResult = await completarCambio(await extractWithGPT(text), text);
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
      vehicle.transmission = cambioConfirmado(vehicle.transmission, caption ?? "");
    }
    return vehicle;
  } catch (error) {
    console.error("[ai] Vision extraction failed:", error);
    return null;
  }
}
