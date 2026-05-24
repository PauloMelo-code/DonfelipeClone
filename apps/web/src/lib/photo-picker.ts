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

const SYSTEM_PROMPT = `Voce e um curador de fotos de anuncios de carros.

Recebera 2 a 6 fotos do mesmo veiculo. Escolha o INDICE (0-based) da foto que
MELHOR funciona como FOTO DESTAQUE do anuncio.

CRITERIOS (em ordem de prioridade):
1. Mostra o carro INTEIRO (a maior parte da carroceria visivel)
2. Vista lateral/diagonal externa (3/4 ou perfil)
3. Carro centralizado e em foco
4. Boa iluminacao, fundo limpo

EVITAR como destaque:
- Foto da interna/bancos/painel/volante
- Foto so do motor
- Detalhe de roda/farol/escapamento
- Foto do porta-malas aberto
- Print de tela de aplicativo

Responda APENAS com o numero do indice (ex: "2"), sem explicacao.
Se todas as fotos forem ruins, retorne 0.`;

/**
 * Escolhe o indice da melhor foto destaque entre as fornecidas.
 *
 * @param photoUrls URLs (http://, data:image, ou path /api/media/X)
 * @returns indice (0-based) da melhor foto, ou 0 se Vision falhar.
 */
export async function pickBestPhotoIndex(photoUrls: string[]): Promise<number> {
  if (!photoUrls || photoUrls.length === 0) return 0;
  if (photoUrls.length === 1) return 0;

  // GPT Vision aceita ate ~20 imagens por request. Limitamos a 6 pra economizar.
  const photos = photoUrls.slice(0, 6);

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 10,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: `Foto destaque do veiculo. ${photos.length} candidatas, escolha o melhor indice (0 a ${photos.length - 1}):` },
            ...photos.map((url) => ({
              type: "image_url" as const,
              image_url: { url, detail: "low" as const },
            })),
          ],
        },
      ],
    });

    const raw = (completion.choices[0]?.message?.content || "").trim();
    const match = raw.match(/\d+/);
    if (!match) return 0;
    const idx = parseInt(match[0], 10);
    if (isNaN(idx) || idx < 0 || idx >= photos.length) return 0;
    return idx;
  } catch (err) {
    console.error("[photo-picker] GPT Vision failed:", err);
    return 0; // fallback: mantem ordem original
  }
}

/**
 * Reordena array de fotos colocando a "melhor" em [0].
 *
 * @returns novo array com a melhor foto primeiro
 */
export async function reorderPhotosByBest(photoUrls: string[]): Promise<{
  reordered: string[];
  originalBestIndex: number;
  changed: boolean;
}> {
  if (!photoUrls || photoUrls.length <= 1) {
    return { reordered: photoUrls, originalBestIndex: 0, changed: false };
  }

  const bestIdx = await pickBestPhotoIndex(photoUrls);
  if (bestIdx === 0) {
    return { reordered: photoUrls, originalBestIndex: 0, changed: false };
  }

  const best = photoUrls[bestIdx];
  const reordered = [
    best,
    ...photoUrls.slice(0, bestIdx),
    ...photoUrls.slice(bestIdx + 1),
  ];
  return { reordered, originalBestIndex: bestIdx, changed: true };
}
