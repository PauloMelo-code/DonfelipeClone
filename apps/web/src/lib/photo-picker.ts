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

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
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
    // Garante length igual ao numero de fotos
    while (categories.length < photoUrls.length) categories.push("outro");

    // REFORCO: se best aponta pra foto categorizada como interior/motor/screenshot,
    // procura a primeira "exterior" da lista como fallback
    const bestCat = categories[best];
    if (bestCat !== "exterior") {
      const exteriorIdx = categories.findIndex((c) => c === "exterior");
      if (exteriorIdx !== -1 && exteriorIdx < photos.length) {
        best = exteriorIdx;
      }
    }

    return { best, categories: categories.slice(0, photoUrls.length) };
  } catch (err) {
    console.error("[photo-picker] GPT Vision analyze failed:", err);
    return { best: 0, categories: photoUrls.map(() => "outro" as PhotoCategory) };
  }
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
