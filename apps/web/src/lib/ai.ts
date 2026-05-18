import OpenAI from "openai";

export interface VehicleData {
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
// Brazilian Number Parser
// ---------------------------------------------------------------------------

function parseBrazilianNumber(raw: string): number | null {
  if (!raw) return null;
  let s = raw.trim();

  // "85mil" or "85.5mil" or "85,5mil"
  const milMatch = s.match(/^([\d.,]+)\s*mil$/i);
  if (milMatch) {
    return parseFloat(milMatch[1].replace(",", ".")) * 1000;
  }

  // "99.9k" or "99,9k"
  const kMatch = s.match(/^([\d.,]+)\s*k$/i);
  if (kMatch) {
    return parseFloat(kMatch[1].replace(",", ".")) * 1000;
  }

  // Brazilian format: "127.000" or "127.000,00"
  // Remove dots (thousands), replace comma with dot (decimal)
  s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Known Brands for Model Detection
// ---------------------------------------------------------------------------

const BRANDS = [
  "TOYOTA", "HONDA", "HYUNDAI", "CHEVROLET", "VOLKSWAGEN", "VW", "FIAT",
  "FORD", "NISSAN", "JEEP", "MITSUBISHI", "KIA", "RENAULT", "PEUGEOT",
  "CITROEN", "BMW", "MERCEDES", "AUDI", "VOLVO", "LAND ROVER", "JAGUAR",
  "PORSCHE", "SUBARU", "SUZUKI", "CHERY", "CAOA CHERY", "BYD", "GWM",
  "RAM", "DODGE", "CHRYSLER", "MINI", "LEXUS", "INFINITI", "MASERATI",
];

// ---------------------------------------------------------------------------
// Regex Vehicle Extractor (ZERO COST — no AI calls)
// ---------------------------------------------------------------------------

function extractWithRegex(text: string): VehicleData | null {
  const clean = text
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}]/gu, "")
    .trim();

  if (!clean || clean.length < 20) return null;

  const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean);

  // --- Year ---
  // CRITICAL: ignorar linhas de IPVA/licenciamento. "IPVA 2026 pago" NAO eh
  // o ano do carro -- o regex pegava 2026 e o anuncio saia com ano errado.
  const isIpvaLine = (l: string) =>
    /\b(ipva|licenciamento|licenciad[oa]|seguro|multa|placa)\b/i.test(l);
  let year: number | null = null;
  let yearModel: number | null = null;
  for (const line of lines) {
    if (isIpvaLine(line)) continue; // pula linha de IPVA/licenciamento
    // "2022/2023" or "22/23" or "2022/23"
    const ym = line.match(/\b(20\d{2})\s*[\/]\s*(20\d{2}|\d{2})\b/);
    if (ym) {
      year = parseInt(ym[1]);
      const ym2 = ym[2].length === 2 ? 2000 + parseInt(ym[2]) : parseInt(ym[2]);
      yearModel = ym2;
      break;
    }
    // "Ano 2022" or "Ano: 2022"
    const yOnly = line.match(/\bano\s*:?\s*(20\d{2})\b/i) || line.match(/\b(20\d{2})\b/);
    if (yOnly && !year) {
      const y = parseInt(yOnly[1]);
      if (y >= 2010 && y <= 2030) { year = y; }
    }
  }

  // --- KM ---
  let km: number | null = null;
  // IMPORTANTE: ordem dos patterns importa. Patterns mais especificos (km/quilometragem
  // como prefixo) vem ANTES do generico "X.XXX km" que poderia confundir com ano.
  const kmPatterns = [
    /\bquilometragem\s*:?\s*([\d.,]+)/i,
    /\bkm\s*:?\s*([\d.,]+)/i,
    /\b(\d{2,3})\s*mil\s*km\b/i,
    /\b([\d.,]+)\s*km\b/i,
  ];
  for (const p of kmPatterns) {
    const m = clean.match(p);
    if (m) {
      let n: number | null;
      if (/mil/i.test(m[0])) {
        n = parseInt(m[1]) * 1000;
      } else {
        n = parseBrazilianNumber(m[1]);
      }
      // Rejeita valores que parecem ano (1900-2099 com exatamente 4 digitos sem ponto)
      const raw = m[1].replace(/[.,\s]/g, "");
      if (n !== null && raw.length === 4 && /^(19|20)\d{2}$/.test(raw)) continue;
      // KM razoavel: 0 a 999.999
      if (n !== null && n >= 0 && n <= 999999) {
        km = n;
        break;
      }
    }
  }

  // --- FIPE (extrai PRIMEIRO pra poder excluir essa linha do preco) ---
  let fipePrice: number | null = null;
  const fipeMatch = clean.match(/fipe\s*:?\s*r?\$?\s*([\d.,]+\s*(?:mil)?)/i);
  if (fipeMatch) {
    fipePrice = parseBrazilianNumber(fipeMatch[1]);
  }

  // --- Price ---
  // CRITICAL: nunca usar uma linha que menciona "fipe" como preco de venda.
  // O vendedor as vezes posta SO a FIPE (sem o valor da oferta) e o sistema
  // copiava a FIPE como price -> dava "-0% FIPE" e score errado.
  let price: number | null = null;
  const priceText = lines.filter((l) => !/fipe/i.test(l)).join("\n");
  const pricePatterns = [
    /(?:pedid[ao]|faço|faco|valor|vendo|preço|preco|por)\s*:?\s*r?\$?\s*([\d.,]+\s*(?:mil)?)/i,
    /r\$\s*([\d.,]+\s*(?:mil)?)/i,
    /(?:^|\n)\s*([\d]{2,3}[.\s]?\d{3}(?:,\d{2})?)\s*$/m,
  ];
  for (const p of pricePatterns) {
    const m = priceText.match(p);
    if (m) {
      price = parseBrazilianNumber(m[1]);
      if (price !== null && price >= 10000) break;
      price = null;
    }
  }

  // Salvaguarda: se o preco extraido eh identico a FIPE, quase certamente
  // foi a FIPE copiada por engano (anuncio sem valor de oferta real).
  // Zera o price -> regex falha (price obrigatorio) -> cai pro GPT que decide.
  if (price !== null && fipePrice !== null && price === fipePrice) {
    console.log("[regex] price == fipePrice, descartando price (anuncio provavelmente sem oferta)");
    price = null;
  }

  // --- Transmission ---
  let transmission: string | undefined;
  if (/\b(autom[aá]tic[oa]|aut\.?)\b/i.test(clean)) transmission = "AUTOMATICO";
  else if (/\bmanual\b/i.test(clean)) transmission = "MANUAL";
  else if (/\bcvt\b/i.test(clean)) transmission = "CVT";

  // --- Fuel ---
  let fuel: string | undefined;
  if (/\bh[ií]brid[oa]\b/i.test(clean)) fuel = "HIBRIDO";
  else if (/\bdiesel\b/i.test(clean)) fuel = "DIESEL";
  else if (/\bel[eé]tric[oa]\b/i.test(clean)) fuel = "ELETRICO";
  else if (/\bflex\b/i.test(clean)) fuel = "FLEX";
  else if (/\bgasolina\b/i.test(clean)) fuel = "GASOLINA";
  else if (/\betanol\b/i.test(clean)) fuel = "ETANOL";

  // --- Model (first non-empty line that looks like a vehicle name) ---
  let model: string | null = null;
  let brand: string | undefined;
  for (const line of lines.slice(0, 5)) {
    const l = line.replace(/[*_~`]/g, "").trim();
    if (!l || l.length < 3 || l.length > 80) continue;
    // Skip lines that are just numbers, dates, or common non-model text
    if (/^\d+$/.test(l)) continue;
    if (/^(ano|km|preco|valor|fipe|pedid|r\$)/i.test(l)) continue;
    // Check if line contains a known brand
    const upperL = l.toUpperCase();
    for (const b of BRANDS) {
      if (upperL.includes(b)) {
        brand = b === "VW" ? "VOLKSWAGEN" : b;
        // Model is the line, optionally without the brand prefix
        model = l;
        break;
      }
    }
    if (model) break;
    // If no brand found but looks like a model name (has letters + possibly numbers)
    if (/[a-zA-Z]/.test(l) && !/^(✅|📊|💰|📍|🔑)/u.test(l)) {
      model = l;
      break;
    }
  }

  // --- Color ---
  let color: string | undefined;
  const colorMatch = clean.match(/\bcor\s*:?\s*([a-zA-ZÀ-ú\s]+)/i);
  if (colorMatch) color = colorMatch[1].trim();
  else {
    const colors = ["preto", "branco", "prata", "cinza", "vermelho", "azul", "verde", "dourado", "bege", "marrom"];
    for (const c of colors) {
      if (clean.toLowerCase().includes(c)) { color = c.charAt(0).toUpperCase() + c.slice(1); break; }
    }
  }

  // --- Plate ---
  let plate: string | undefined;
  const plateMatch = clean.match(/\b([A-Z]{3}\s*-?\s*\d[A-Z0-9]\d{2})\b/i);
  if (plateMatch) plate = plateMatch[1].replace(/\s/g, "").toUpperCase();

  // --- State ---
  // Deteccao em camadas (do mais confiavel ao menos):
  //  1. Nome do estado por extenso ("Santa Catarina")
  //  2. Cidade conhecida -> estado
  //  3. "emplacado SC" / "placa SC"
  //  4. Sigla isolada (RS/SC/PR/SP) -- ultimo recurso
  let state: string | undefined;
  const lowerClean = clean.toLowerCase();

  const STATE_NAMES: Record<string, RegExp> = {
    SC: /\bsanta\s*catarina\b/i,
    RS: /\brio\s*grande\s*do\s*sul\b/i,
    PR: /\bparan[aá]\b/i,
    SP: /\bs[ãa]o\s*paulo\b/i,
  };
  // Cidades -> estado (as mais comuns nos anuncios de repasse do Sul)
  const CITY_STATE: Record<string, string> = {
    "florianopolis": "SC", "florianópolis": "SC", "joinville": "SC",
    "blumenau": "SC", "itajai": "SC", "itajaí": "SC", "chapeco": "SC",
    "chapecó": "SC", "criciuma": "SC", "criciúma": "SC", "lages": "SC",
    "balneario camboriu": "SC", "balneário camboriú": "SC", "camboriu": "SC",
    "jaragua do sul": "SC", "jaraguá do sul": "SC", "brusque": "SC",
    "tubarao": "SC", "tubarão": "SC", "palhoca": "SC", "palhoça": "SC",
    "sao bento do sul": "SC", "navegantes": "SC", "itapema": "SC",
    "concordia": "SC", "concórdia": "SC", "indaial": "SC", "gaspar": "SC",
    "porto alegre": "RS", "caxias do sul": "RS", "pelotas": "RS",
    "canoas": "RS", "santa maria": "RS", "gravatai": "RS", "gravataí": "RS",
    "novo hamburgo": "RS", "passo fundo": "RS", "rio grande": "RS",
    "curitiba": "PR", "londrina": "PR", "maringa": "PR", "maringá": "PR",
    "ponta grossa": "PR", "cascavel": "PR", "foz do iguacu": "PR",
    "foz do iguaçu": "PR", "guarapuava": "PR", "sao jose dos pinhais": "PR",
  };

  // 1. Nome por extenso
  for (const [uf, rx] of Object.entries(STATE_NAMES)) {
    if (rx.test(clean)) { state = uf; break; }
  }
  // 2. Cidade
  let location: string | undefined;
  if (!state) {
    for (const [city, uf] of Object.entries(CITY_STATE)) {
      if (lowerClean.includes(city)) {
        state = uf;
        location = city.replace(/\b\w/g, (c) => c.toUpperCase());
        break;
      }
    }
  }
  // 3. "emplacado SC" / "placa de SC"
  if (!state) {
    const placaMatch = clean.match(/\b(?:emplacad[oa]|placa\s*(?:de|do)?)\s+(RS|SC|PR|SP|RJ|MG|BA|GO|DF|MT|MS|ES|PE|CE|MA|PA|AM|RN|PB|AL|SE|PI|RO|AC|AP|RR|TO)\b/i);
    if (placaMatch) state = placaMatch[1].toUpperCase();
  }
  // 4. Sigla isolada (case-insensitive) -- ultimo recurso
  if (!state) {
    const sigla = clean.match(/\b(RS|SC|PR|SP)\b/i);
    if (sigla) state = sigla[1].toUpperCase();
  }

  // --- Location (fallback se nao veio da cidade acima) ---
  if (!location) {
    const locMatch = clean.match(/\b(florian[oó]polis|porto\s*alegre|curitiba|blumenau|joinville|itaja[ií]|canoas|caxias|maring[aá]|londrina|guarapuava)\b/i);
    if (locMatch) location = locMatch[1];
  }

  // --- Phone ---
  let sellerPhone: string | undefined;
  const phoneMatch = clean.match(/\(?\d{2}\)?\s*9?\s*\d{4}[-.\s]?\d{4}/);
  if (phoneMatch) sellerPhone = phoneMatch[0];

  // --- Features (lines that are short descriptions) ---
  const features: string[] = [];
  for (const line of lines) {
    const l = line.replace(/^[✅✓☑️•\-\*]\s*/u, "").trim();
    if (!l || l.length < 3 || l.length > 60) continue;
    // Skip structural lines
    if (/^(ano|km|preco|valor|fipe|pedid|r\$|modelo|marca|\d{4})/i.test(l)) continue;
    if (l === model) continue;
    // Feature-like lines
    if (/\b(couro|teto|camera|sensor|multimidia|led|airbag|piloto|ar\s*condicionado|keyless|carplay|ipva|revisado|unico\s*dono|manual|chave|laudo|pneu)/i.test(l)) {
      features.push(l);
    }
  }

  // --- Validate minimum required fields ---
  if (!model || !year || km === null || price === null) {
    console.log("[regex] Missing fields:", { model: !!model, year: !!year, km: km !== null, price: price !== null });
    return null;
  }

  return {
    model,
    brand,
    year,
    yearModel: yearModel ?? undefined,
    km,
    price,
    fipePrice: fipePrice ?? undefined,
    transmission,
    fuel,
    color,
    plate,
    location,
    state,
    features,
    photos: [],
    rawDescription: text,
    sellerPhone,
  };
}

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

const EXTRACTION_SYSTEM_PROMPT = `Voce e um especialista em extrair dados de veiculos de anuncios brasileiros de repasse.

Extraia os seguintes campos do texto ou imagem fornecida:
- model: nome do modelo (ex: "CIVIC EXL 2.0")
- brand: marca (ex: "HONDA")
- year: ano de fabricacao (numero inteiro)
- yearModel: ano do modelo (numero inteiro, pode ser diferente do ano de fabricacao)
- km: quilometragem (numero inteiro)
- price: PRECO DE VENDA / OFERTA em reais (numero decimal) -- ver regras criticas abaixo
- fipePrice: preco da TABELA FIPE em reais se mencionado (numero decimal ou null)
- transmission: tipo de cambio - "AUTOMATICO", "MANUAL" ou "CVT"
- fuel: tipo de combustivel - "GASOLINA", "ETANOL", "FLEX", "DIESEL", "HIBRIDO" ou "ELETRICO"
- color: cor do veiculo
- plate: placa se mencionada (formato ABC1D23 ou ABC-1234)
- location: cidade/regiao mencionada
- state: sigla do estado brasileiro
- features: lista de opcionais/caracteristicas como array de strings
- sellerPhone: telefone do vendedor se mencionado

=== REGRAS CRITICAS SOBRE PRECO vs FIPE ===
1. "price" e "fipePrice" sao DUAS COISAS DIFERENTES e quase nunca iguais.
   - fipePrice = valor da tabela FIPE (referencia de mercado).
   - price = o que o vendedor esta PEDINDO pelo carro (a oferta real).
2. A FIPE aparece SEMPRE perto da palavra "FIPE". O preco de venda aparece
   perto de "por", "valor", "pedido", "vendo", "R$" SEM a palavra fipe.
3. NUNCA copie o valor da FIPE para o campo price. Se a unica cifra do
   anuncio estiver na linha da FIPE (ex: "Fipe R$ 169.302" e nada mais),
   entao o anuncio NAO TEM preco de venda -> retorne price = null.
4. Em repasse o preco de venda quase sempre eh MENOR que a FIPE. Se voce
   extrair um price IGUAL ou MAIOR que a fipePrice, releia: provavelmente
   confundiu os dois. Na duvida, deixe price = null.
5. Exemplos:
   - "Fipe R$ 169.302" (so isso)        -> fipePrice=169302, price=null
   - "Fipe 80mil / Por 72mil"           -> fipePrice=80000, price=72000
   - "Valor 65.000 - Fipe da 71.000"    -> price=65000, fipePrice=71000
   - "Vendo por 90 mil"                 -> price=90000, fipePrice=null

=== REGRAS CRITICAS SOBRE O ANO ===
1. "year" e "yearModel" sao o ano de FABRICACAO e MODELO do veiculo.
2. NUNCA confunda com o ano do IPVA/licenciamento. Frases como
   "IPVA 2026 pago", "IPVA 26 PG", "licenciado 2025", "seguro ate 2026"
   referem-se a documentos, NAO ao ano do carro.
3. O ano do carro costuma aparecer sozinho ("2019"), apos "Ano:", ou no
   formato fabricacao/modelo ("2019/2020"). Geralmente perto do modelo
   ou da quilometragem.
4. Exemplos:
   - "Compass 2019 / IPVA 2026 pago"     -> year=2019 (NAO 2026)
   - "Civic 2020/2021 - Licenciado 2025" -> year=2020, yearModel=2021
   - "Onix 2022 IPVA 25 PG"              -> year=2022 (NAO 2025)

REGRAS DE FORMATO BRASILEIRO:
- "127.000" ou "127 mil" = 127000
- "R$ 85.000" ou "85mil" = 85000
- Ano: "2020/2021" significa year=2020, yearModel=2021

Se um campo nao puder ser extraido com certeza, use null.
Retorne APENAS o JSON valido.`;

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
      transmission: { type: ["string", "null"] as const, enum: ["AUTOMATICO", "MANUAL", "CVT", null] },
      fuel: { type: ["string", "null"] as const, enum: ["GASOLINA", "ETANOL", "FLEX", "DIESEL", "HIBRIDO", "ELETRICO", null] },
      color: { type: ["string", "null"] as const },
      plate: { type: ["string", "null"] as const },
      location: { type: ["string", "null"] as const },
      state: { type: ["string", "null"] as const },
      features: { type: "array" as const, items: { type: "string" as const } },
      sellerPhone: { type: ["string", "null"] as const },
    },
    required: ["model", "brand", "year", "yearModel", "km", "price", "fipePrice", "transmission", "fuel", "color", "plate", "location", "state", "features", "sellerPhone"],
    additionalProperties: false,
  },
};

function parseGptResponse(raw: string): VehicleData | null {
  try {
    const parsed = JSON.parse(raw);
    // Salvaguarda dupla: se o GPT extraiu price igual a fipePrice, ele
    // confundiu os dois campos. Descarta o price (anuncio sem oferta real).
    if (
      parsed.price != null &&
      parsed.fipePrice != null &&
      parsed.price === parsed.fipePrice
    ) {
      console.log("[ai] GPT: price == fipePrice, descartando price");
      parsed.price = null;
    }
    if (!parsed.model || parsed.year == null || parsed.km == null || !parsed.price) return null;
    return {
      model: parsed.model, brand: parsed.brand ?? undefined,
      year: parsed.year, yearModel: parsed.yearModel ?? undefined,
      km: parsed.km, price: parsed.price, fipePrice: parsed.fipePrice ?? undefined,
      transmission: parsed.transmission ?? undefined, fuel: parsed.fuel ?? undefined,
      color: parsed.color ?? undefined, plate: parsed.plate ?? undefined,
      location: parsed.location ?? undefined, state: parsed.state ?? undefined,
      features: parsed.features ?? [], photos: [],
      rawDescription: undefined, sellerPhone: parsed.sellerPhone ?? undefined,
    };
  } catch { return null; }
}

async function extractWithGPT(text: string): Promise<VehicleData | null> {
  if (!process.env.OPENAI_API_KEY) return null;
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
    if (!content) return null;
    return parseGptResponse(content);
  } catch (error) {
    console.error("[ai] GPT extraction failed:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract vehicle data from text.
 * Strategy: Regex first (free), GPT fallback (paid) only if regex fails.
 */
export async function extractVehicleFromText(
  text: string
): Promise<VehicleData | null> {
  const cached = getCached(text);
  if (cached !== undefined) return cached;

  // 1. Try regex first (FREE)
  const regexResult = extractWithRegex(text);
  if (regexResult) {
    console.log("[ai] Regex extraction succeeded for:", regexResult.model);
    setCache(text, regexResult);
    return regexResult;
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
      const { prisma: db } = await import("./prisma");
      const media = await db.mediaFile.findUnique({ where: { id: mediaId } });
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
