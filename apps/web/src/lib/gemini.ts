// ---------------------------------------------------------------------------
// Gemini Client — fallback do OpenAI
// ---------------------------------------------------------------------------
// Usado quando GPT-4o-mini falha (timeout, quota, 5xx). Gemini 2.0 Flash tem
// preco menor e latencia mais baixa, alem de servir como redundancia se a
// API do OpenAI cair.
//
// Configurar via GEMINI_API_KEY no .env. Se nao configurado, todas as
// funcoes retornam null (consumidor deve manter texto original como fallback).
// ---------------------------------------------------------------------------

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.0-flash";

export const isGeminiConfigured = () => !!process.env.GEMINI_API_KEY;

interface GeminiOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
}

/**
 * Chama Gemini com system + user prompts. Retorna o texto gerado ou null
 * se nao configurado, falhou, ou resposta vazia.
 */
export async function geminiGenerateText(
  systemPrompt: string,
  userPrompt: string,
  options: GeminiOptions = {}
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = options.model || DEFAULT_MODEL;
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

  const body: Record<string, unknown> = {
    contents: [
      { role: "user", parts: [{ text: userPrompt }] },
    ],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: options.temperature ?? 0.1,
      maxOutputTokens: options.maxTokens ?? 500,
      ...(options.jsonMode ? { responseMimeType: "application/json" } : {}),
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[gemini] HTTP ${res.status}:`, errBody.slice(0, 200));
      return null;
    }
    const data = await res.json();
    // Resposta padrao: candidates[0].content.parts[0].text
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string" || !text.trim()) {
      console.warn("[gemini] resposta vazia ou em formato inesperado");
      return null;
    }
    return text.trim();
  } catch (err) {
    clearTimeout(timeout);
    console.error("[gemini] failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
