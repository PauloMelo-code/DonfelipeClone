// ---------------------------------------------------------------------------
// Photo Picker — GPT Vision escolhe a melhor foto do carro
// ---------------------------------------------------------------------------
// Vendedor frequentemente manda foto da interna ANTES da foto principal do
// carro. Sistema atual usa a 1a chegada como destaque -> anuncio sai com
// foto ruim e operador descarta.
//
// Esse modulo usa GPT-4o-mini (visao) pra analisar 2-6 fotos e escolher
// qual mostra MELHOR o carro inteiro de fora (foto destaque "ideal").
// Roda em BACKGROUND apos criar o Vehicle -- nao atrasa o webhook.
// ---------------------------------------------------------------------------

import OpenAI from "openai";
import { isGeminiConfigured } from "./gemini";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// ============================================================================
// GEMINI VISION FALLBACK
// ============================================================================
// Gemini 2.0 Flash aceita multiplas imagens. Suportamos URLs http(s) (Gemini
// busca a imagem) e data URLs base64 (embedamos inline_data).

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

interface InlinePart {
  inlineData: { mimeType: string; data: string };
}

function parseDataUrl(url: string): InlinePart | null {
  const m = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { inlineData: { mimeType: m[1], data: m[2] } };
}

async function fetchAsInlinePart(url: string): Promise<InlinePart | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type") || "image/jpeg";
    const buf = await res.arrayBuffer();
    const data = Buffer.from(buf).toString("base64");
    return { inlineData: { mimeType, data } };
  } catch {
    return null;
  }
}

async function analyzePhotosWithGemini(photoUrls: string[]): Promise<PhotoAnalysis | null> {
  if (!isGeminiConfigured()) return null;
  const apiKey = process.env.GEMINI_API_KEY!;
  // Converte URLs pra inline_data (Gemini quer base64 ou URI publica)
  const parts: (InlinePart | { text: string })[] = [
    { text: `Analise as ${photoUrls.length} fotos abaixo (indices 0 a ${photoUrls.length - 1}):` },
  ];
  for (const url of photoUrls) {
    let part = parseDataUrl(url);
    if (!part) part = await fetchAsInlinePart(url);
    if (part) parts.push(part);
  }
  // Se nao conseguiu carregar nenhuma imagem, aborta
  if (parts.length <= 1) return null;

  const url = `${GEMINI_API_BASE}/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ role: "user", parts }],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 200,
      responseMimeType: "application/json",
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`[photo-picker:gemini] HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    let best = typeof parsed.best === "number" ? parsed.best : 0;
    if (best < 0 || best >= photoUrls.length) best = 0;
    const rawCats: unknown[] = Array.isArray(parsed.categories) ? parsed.categories : [];
    const categories: PhotoCategory[] = rawCats.map((c) => {
      const s = String(c).toLowerCase();
      return (VALID_CATEGORIES.includes(s as PhotoCategory) ? s : "outro") as PhotoCategory;
    });
    while (categories.length < photoUrls.length) categories.push("outro");
    return { best, categories: categories.slice(0, photoUrls.length) };
  } catch (err) {
    console.error("[photo-picker:gemini] failed:", err);
    return null;
  }
}

export type PhotoCategory = "exterior" | "interior" | "motor" | "detalhe" | "screenshot" | "outro";

const SYSTEM_PROMPT = `Voce e um curador de fotos de anuncios de carros.

Recebera 2 a 6 fotos do mesmo veiculo. Sua tarefa:
1. CATEGORIZAR cada foto em UMA dessas categorias:
   - "exterior": carro inteiro de fora (lateral/diagonal/frente/traseira)
   - "interior": bancos, painel, volante, console central
   - "motor": cofre, motor, embaixo do capo
   - "detalhe": roda, farol, lanterna, escapamento, retrovisor isolado
   - "screenshot": print de aplicativo, tela de celular, foto de FIPE/tabela
   - "outro": qualquer outra coisa

2. ESCOLHER o INDICE (0-based) da MELHOR foto destaque do anuncio:
   - PREFERIR vista lateral/diagonal externa (3/4 ou perfil)
   - Carro centralizado, em foco, boa iluminacao
   - EVITAR interior/motor/detalhe/screenshot como destaque

RESPONDA em JSON estrito (sem markdown, sem comentarios):
{"best": <indice 0-based>, "categories": ["<categoria1>", "<categoria2>", ...]}

Se todas as fotos forem ruins, escolha a "menos pior" como best.
Sempre retorne TODAS as categorias na ordem das fotos enviadas.`;

export interface PhotoAnalysis {
  best: number;
  categories: PhotoCategory[];
}

const VALID_CATEGORIES: PhotoCategory[] = ["exterior", "interior", "motor", "detalhe", "screenshot", "outro"];

/**
 * Analisa um array de fotos: retorna indice da melhor + categoria de cada uma.
 * Vision faz tudo em UMA chamada (economiza vs duas requests separadas).
 *
 * @returns { best: 0-based index, categories: array paralelo com tipo de cada foto }
 */
export async function analyzePhotos(photoUrls: string[]): Promise<PhotoAnalysis> {
  if (!photoUrls || photoUrls.length === 0) {
    return { best: 0, categories: [] };
  }
  // 1 foto: assume exterior (sem chamar Vision)
  if (photoUrls.length === 1) {
    return { best: 0, categories: ["exterior"] };
  }

  const photos = photoUrls.slice(0, 6);

  // Helper: aplica REFORCO de exterior como destaque
  const applyExteriorReforco = (result: PhotoAnalysis): PhotoAnalysis => {
    let best = result.best;
    const bestCat = result.categories[best];
    if (bestCat !== "exterior") {
      const exteriorIdx = result.categories.findIndex((c) => c === "exterior");
      if (exteriorIdx !== -1 && exteriorIdx < photos.length) {
        best = exteriorIdx;
      }
    }
    return { best, categories: result.categories };
  };

  // 1) Tenta GPT-4o-mini Vision (primario)
  if (process.env.OPENAI_API_KEY) {
    try {
      const completion = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `Analise as ${photos.length} fotos abaixo (indices 0 a ${photos.length - 1}):` },
              ...photos.map((url) => ({
                type: "image_url" as const,
                image_url: { url, detail: "low" as const },
              })),
            ],
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(raw);
      let best = typeof parsed.best === "number" ? parsed.best : 0;
      if (best < 0 || best >= photos.length) best = 0;

      const rawCats: unknown[] = Array.isArray(parsed.categories) ? parsed.categories : [];
      const categories: PhotoCategory[] = rawCats.map((c) => {
        const s = String(c).toLowerCase();
        return (VALID_CATEGORIES.includes(s as PhotoCategory) ? s : "outro") as PhotoCategory;
      });
      while (categories.length < photoUrls.length) categories.push("outro");

      return applyExteriorReforco({ best, categories: categories.slice(0, photoUrls.length) });
    } catch (err) {
      console.error("[photo-picker] GPT Vision failed, tentando Gemini:", err);
    }
  }

  // 2) Fallback: Gemini Vision (se configurado)
  if (isGeminiConfigured()) {
    const geminiResult = await analyzePhotosWithGemini(photos);
    if (geminiResult) {
      console.log("[photo-picker] usado fallback Gemini Vision com sucesso");
      return applyExteriorReforco(geminiResult);
    }
  }

  // 3) Sem IA -- fallback final: ordem original, categorias "outro"
  return { best: 0, categories: photoUrls.map(() => "outro" as PhotoCategory) };
}

/**
 * Reordena array de fotos colocando a "melhor" em [0], retornando tambem
 * as categorias reordenadas paralelamente.
 */
export async function reorderPhotosByBest(photoUrls: string[]): Promise<{
  reordered: string[];
  categories: PhotoCategory[];
  originalBestIndex: number;
  changed: boolean;
}> {
  if (!photoUrls || photoUrls.length <= 1) {
    return {
      reordered: photoUrls,
      categories: photoUrls.map(() => "exterior" as PhotoCategory),
      originalBestIndex: 0,
      changed: false,
    };
  }

  const { best: bestIdx, categories } = await analyzePhotos(photoUrls);
  if (bestIdx === 0) {
    return { reordered: photoUrls, categories, originalBestIndex: 0, changed: false };
  }

  const best = photoUrls[bestIdx];
  const reordered = [
    best,
    ...photoUrls.slice(0, bestIdx),
    ...photoUrls.slice(bestIdx + 1),
  ];
  const reorderedCats = [
    categories[bestIdx],
    ...categories.slice(0, bestIdx),
    ...categories.slice(bestIdx + 1),
  ];
  return { reordered, categories: reorderedCats, originalBestIndex: bestIdx, changed: true };
}
