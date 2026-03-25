import OpenAI from "openai";

interface VehicleData {
  model: string;
  brand?: string;
  year: number;
  yearModel?: number;
  km: number;
  price: number;
  fipePrice?: number;
  transmission?: string;
  fuel?: string;
  color?: string;
  plate?: string;
  location?: string;
  state?: string;
  features: string[];
  photos: string[];
  rawDescription?: string;
  sellerPhone?: string;
}

// ---------------------------------------------------------------------------
// OpenAI Client
// ---------------------------------------------------------------------------

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

const EXTRACTION_SYSTEM_PROMPT = `Voce e um assistente especializado em extrair dados de veiculos a partir de anuncios brasileiros.

Extraia os seguintes campos do texto ou imagem fornecida:
- model: nome do modelo (ex: "CIVIC EXL 2.0")
- brand: marca (ex: "HONDA")
- year: ano de fabricacao (numero inteiro)
- yearModel: ano do modelo (numero inteiro, pode ser diferente do ano de fabricacao)
- km: quilometragem (numero inteiro)
- price: preco de venda em reais (numero decimal)
- fipePrice: preco FIPE em reais se mencionado (numero decimal ou null)
- transmission: tipo de cambio - "AUTOMATICO", "MANUAL" ou "CVT"
- fuel: tipo de combustivel - "GASOLINA", "ETANOL", "FLEX", "DIESEL", "HIBRIDO" ou "ELETRICO"
- color: cor do veiculo
- plate: placa se mencionada (formato ABC1D23 ou ABC-1234)
- location: cidade/regiao mencionada (ex: "Florianopolis", "Porto Alegre")
- state: sigla do estado brasileiro (ex: "RS", "SC", "SP"). Extraia de: "emplacado RS", "Florianopolis" (SC), "Porto Alegre" (RS), etc.
- features: lista de opcionais/caracteristicas como array de strings
- sellerPhone: telefone do vendedor se mencionado

REGRAS DE FORMATO BRASILEIRO:
- "127.000" ou "127 mil" = 127000
- "99.9k" ou "99,9k" = 99900
- "R$ 85.000" ou "85mil" = 85000
- Quilometragem: "45.000km" ou "45mil km" = 45000
- Ano: "2020/2021" significa year=2020, yearModel=2021
- Ano: "20/21" significa year=2020, yearModel=2021

Se um campo nao puder ser extraido, use null.
Retorne APENAS o JSON valido, sem texto adicional.`;

// ---------------------------------------------------------------------------
// JSON Schema for response format
// ---------------------------------------------------------------------------

const VEHICLE_JSON_SCHEMA = {
  name: "vehicle_data",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      model: { type: ["string", "null"] as const },
      brand: { type: ["string", "null"] as const },
      year: { type: ["number", "null"] as const },
      yearModel: { type: ["number", "null"] as const },
      km: { type: ["number", "null"] as const },
      price: { type: ["number", "null"] as const },
      fipePrice: { type: ["number", "null"] as const },
      transmission: {
        type: ["string", "null"] as const,
        enum: ["AUTOMATICO", "MANUAL", "CVT", null],
      },
      fuel: {
        type: ["string", "null"] as const,
        enum: [
          "GASOLINA",
          "ETANOL",
          "FLEX",
          "DIESEL",
          "HIBRIDO",
          "ELETRICO",
          null,
        ],
      },
      color: { type: ["string", "null"] as const },
      plate: { type: ["string", "null"] as const },
      location: { type: ["string", "null"] as const },
      state: { type: ["string", "null"] as const },
      features: {
        type: "array" as const,
        items: { type: "string" as const },
      },
      sellerPhone: { type: ["string", "null"] as const },
    },
    required: [
      "model",
      "brand",
      "year",
      "yearModel",
      "km",
      "price",
      "fipePrice",
      "transmission",
      "fuel",
      "color",
      "plate",
      "location",
      "state",
      "features",
      "sellerPhone",
    ],
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseResponse(raw: string): VehicleData | null {
  try {
    const parsed = JSON.parse(raw);

    // model and year are required for a valid vehicle
    if (!parsed.model || !parsed.year || !parsed.km || !parsed.price) {
      return null;
    }

    return {
      model: parsed.model,
      brand: parsed.brand ?? undefined,
      year: parsed.year,
      yearModel: parsed.yearModel ?? undefined,
      km: parsed.km,
      price: parsed.price,
      fipePrice: parsed.fipePrice ?? undefined,
      transmission: parsed.transmission ?? undefined,
      fuel: parsed.fuel ?? undefined,
      color: parsed.color ?? undefined,
      plate: parsed.plate ?? undefined,
      location: parsed.location ?? undefined,
      state: parsed.state ?? undefined,
      features: parsed.features ?? [],
      photos: [],
      rawDescription: undefined,
      sellerPhone: parsed.sellerPhone ?? undefined,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract vehicle data from a text message using GPT-4o.
 */
export async function extractVehicleFromText(
  text: string
): Promise<VehicleData | null> {
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      temperature: 0.1,
      response_format: {
        type: "json_schema",
        json_schema: VEHICLE_JSON_SCHEMA,
      },
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return null;

    const vehicle = parseResponse(content);
    if (vehicle) {
      vehicle.rawDescription = text;
    }
    return vehicle;
  } catch (error) {
    console.error("[ai] Failed to extract vehicle from text:", error);
    return null;
  }
}

/**
 * Extract vehicle data from an image using GPT-4o vision.
 */
export async function extractVehicleFromImage(
  imageUrl: string,
  caption?: string
): Promise<VehicleData | null> {
  try {
    // Convert local /api/media/ URLs to base64 data URIs for OpenAI
    let visionUrl = imageUrl;
    if (imageUrl.startsWith("/api/media/")) {
      const mediaId = imageUrl.replace("/api/media/", "");
      const { prisma: db } = await import("./prisma");
      const media = await db.mediaFile.findUnique({ where: { id: mediaId } });
      if (media) {
        const mimeType = media.mimeType === "application/octet-stream" ? "image/jpeg" : media.mimeType;
        visionUrl = `data:${mimeType};base64,${media.data}`;
      }
    }

    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      {
        type: "image_url",
        image_url: { url: visionUrl, detail: "high" },
      },
    ];

    if (caption) {
      userContent.push({
        type: "text",
        text: `Legenda da imagem: ${caption}`,
      });
    }

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      temperature: 0.1,
      response_format: {
        type: "json_schema",
        json_schema: VEHICLE_JSON_SCHEMA,
      },
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return null;

    const vehicle = parseResponse(content);
    if (vehicle) {
      vehicle.rawDescription = caption ?? undefined;
      vehicle.photos = [imageUrl];
    }
    return vehicle;
  } catch (error) {
    console.error("[ai] Failed to extract vehicle from image:", error);
    return null;
  }
}
