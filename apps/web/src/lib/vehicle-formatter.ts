// ---------------------------------------------------------------------------
// Vehicle Ad Formatter
// ---------------------------------------------------------------------------
// THE MOST CRITICAL FILE for business rules.
//
// Implements the hybrid rule, profit margin calculation, and the
// standardised output template used across all WhatsApp TARGET groups.
// ---------------------------------------------------------------------------

export interface FormatSettings {
  profitMarginPercent: number;
}

/**
 * Format a price in Brazilian notation with decimals.
 * Examples:
 *   177530  -> "177.530,00"
 *    99900  -> "99.900,00"
 */
function priceFormatted(value: number): string {
  return Math.round(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format km in pt-BR locale: 45000 -> "45.000"
 */
function kmFormatted(km: number): string {
  return km.toLocaleString("pt-BR");
}

/**
 * Determine the transmission label to display.
 *
 * **HYBRID RULE**: if the vehicle's fuel type is "HIBRIDO", the
 * transmission label becomes "HIBRIDO" regardless of the actual
 * transmission value. Otherwise, it maps to "AUT", "MEC", or "CVT".
 */
function getTransmissionLabel(
  fuel?: string,
  transmission?: string
): string {
  // HYBRID RULE takes precedence
  if (fuel === "HIBRIDO") {
    return "(híbrido)";
  }

  switch (transmission) {
    case "AUTOMATICO":
      return "(aut.)";
    case "MANUAL":
      return "(manual)";
    case "CVT":
      return "(CVT)";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Main Formatter
// ---------------------------------------------------------------------------

/**
 * Produce the standardised WhatsApp ad text for a vehicle.
 *
 * @param vehicle  - Vehicle record (typically from the database).
 * @param settings - Contains profitMarginPercent used to compute selling price.
 * @returns The formatted ad string ready to be sent via WhatsApp.
 */
export function formatVehicleAd(
  vehicle: {
    model: string;
    brand?: string | null;
    year: number;
    yearModel?: number | null;
    km: number;
    price: number;
    fipePrice?: number | null;
    transmission?: string | null;
    fuel?: string | null;
    features?: string | string[] | null;
    rawDescription?: string | null;
    location?: string | null;
    state?: string | null;
  },
  settings: FormatSettings
): string {
  // --- Computed values ---
  const sellingPrice = vehicle.price * (1 + settings.profitMarginPercent / 100);
  const transmissionLabel = getTransmissionLabel(
    vehicle.fuel ?? undefined,
    vehicle.transmission ?? undefined
  );
  const kmFmt = kmFormatted(vehicle.km);
  const sellingPriceFmt = priceFormatted(sellingPrice);

  // --- Features ---
  let featuresList: string[] = [];
  if (vehicle.features) {
    if (typeof vehicle.features === "string") {
      try {
        featuresList = JSON.parse(vehicle.features);
      } catch {
        featuresList = [];
      }
    } else {
      featuresList = vehicle.features;
    }
  }

  // --- Year display ---
  const yearDisplay = vehicle.yearModel && vehicle.yearModel !== vehicle.year
    ? `${vehicle.year}/${vehicle.yearModel}`
    : `${vehicle.year}`;

  // --- Remove brand prefix from model if present ---
  let displayModel = vehicle.model;
  if (vehicle.brand) {
    const brandUpper = vehicle.brand.toUpperCase();
    const modelUpper = displayModel.toUpperCase();
    if (modelUpper.startsWith(brandUpper + " ")) {
      displayModel = displayModel.substring(vehicle.brand.length + 1);
    }
  }

  // --- First line: model + transmission (bold for WhatsApp) ---
  const modelLine = transmissionLabel
    ? `*${displayModel} ${transmissionLabel}*`
    : `*${displayModel}*`;

  // --- Build ad ---
  // Format: bold title, year|km, then rawDescription body (original seller text),
  // then Fipe + selling price. Features from AI are NOT used — the rawDescription
  // already contains the human-written description which reads better.

  const lines: string[] = [
    modelLine,
    `${yearDisplay} | ${kmFmt}km`,
  ];

  if (vehicle.rawDescription?.trim()) {
    // Clean the raw description into Cugini format:
    // - Remove ALL emojis
    // - Remove lines that are: model name, year, km, price, fipe, "pedida", location pin
    // - Remove * bold markers
    // - Keep only the "features / description" lines

    const cleaned = vehicle.rawDescription.trim()
      // Remove marcadores de formatacao do WhatsApp: *negrito*, ~tachado~, _italico_
      .replace(/[*~_]/g, "")
      // Remove all emojis and special unicode symbols
      .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}✅✓☑️📊💰📍🔥⚡🚗🏎️⭐🔑]/gu, "");

    const modelFirstWord = vehicle.model.toLowerCase().split(" ")[0];
    const descLines = cleaned.split("\n");
    const bodyLines: string[] = [];

    for (const line of descLines) {
      const l = line.trim();
      const lower = l.toLowerCase();

      // Skip empty lines at the very start
      if (bodyLines.length === 0 && !l) continue;

      // Skip lines that match data we already show in the header/footer
      if (
        // Model name line
        lower.includes(modelFirstWord) && lower.length < 60 && bodyLines.length < 3 ||
        // Year line: "Ano 2025" or "2025" or "2024/2025"
        /^(ano\s*)?\d{4}\s*([\/\|]\s*\d{2,4})?\s*$/i.test(l) ||
        // KM line: "KM 35.000" or "35.000 km" or "35mil km" (linha inteira)
        /^(km\s*)?[\d.,]+\s*(mil\s*)?(km)?\s*$/i.test(l) ||
        // Linha que COMECA repetindo o KM, mesmo com texto depois.
        // Ex: "153.000KM rev ate 90 manual" -- o KM ja esta no cabecalho.
        /^[\d.,]+\s*(mil\s*)?km\b/i.test(l) ||
        // "KM 153.000 ..." (prefixo KM + numero + texto)
        /^km\s*:?\s*[\d.,]+/i.test(l) ||
        // Price lines: "R$ 360.900" "Pedida R$ 360.900" "Fipe R$ 381.000"
        // "Faço R$ 65.900" "Custo 199.998" "Por: 217.998" "Faz 127.000"
        // "Pra hj 122.000" "Tabela 138.000" "Sinal 5.000" "Entrada 20.000"
        // O sistema gera a propria secao Fipe/Por -- nada de preco vaza pro corpo.
        /^(fipe|pedida|faço|faco|faz|valor|preco|preço|por|custo|tabela|sinal|entrada|à\s*vista|a\s*vista|pra\s*(hoje|hj))\s*:?\s*r?\$?\s*~?\s*[\d.,]+/i.test(l) ||
        // Bare price: "R$ 360.900" or just "360.900"
        /^r?\$?\s*[\d.,]+\s*(mil|reais)?\s*$/i.test(l) ||
        // Frases de marketing/chamada do vendedor da fonte -- nao entram no
        // anuncio da Cugini ("Oportunidade menor valor Brasil", etc).
        /\b(oportunidade|menor\s*(valor|pre[çc]o)|melhor\s*(valor|pre[çc]o|oferta)|imperd[ií]vel|aproveite|n[ãa]o\s*perc|super\s*oferta|abaixo\s*da\s*(tabela|fipe)|baita\s*(neg[óo]cio|oferta)|promo[çc][ãa]o|ultim[ao]s?\s*(unidade|dia))\b/i.test(l) ||
        // Frases de NEGOCIACAO do vendedor da fonte -- nao entram no anuncio
        // ("Analisa proposta", "Aceito troca", "Comigo", "Negociavel"...).
        /\b(analis[ao]|aceito|estudo|fa[çc]o|escuto|ou[çv]o)\s+(proposta|oferta|troca)/i.test(l) ||
        /\bproposta\s*(coerente|justa|s[ée]ria|real)/i.test(l) ||
        /\b(neg[oó]ci[aá]vel|aceito\s*troca|estudo\s*troca|aceita\s*troca|sem\s*troca)\b/i.test(l) ||
        /^(comigo|chama|chame|fale|falar|tratar|direto\s*comigo)[\s.!]*$/i.test(l) ||
        /^pra?\s*(hoje|hj|fechar|negociar)\b/i.test(l) ||
        // Location pin: "SP" or "📍 SP" (emoji already stripped, so just "SP")
        /^[A-Z]{2}$/i.test(l) && l.length === 2 ||
        // Transmission/fuel already in title
        /^(automático|automatico|manual|cvt|flex|diesel|híbrido|hibrido)\s*$/i.test(l) ||
        // Remove location lines
        /\b(em\s+estoque|carro\s+em|localiza[çc][ãa]o|disponível\s+em|disponivel\s+em)\b/i.test(l) ||
        /\b(florian[oó]polis|porto\s+alegre|curitiba|blumenau|joinville|itaja[ií]|canoas|caxias|maring[aá]|pelotas|navegantes|s[ãa]o\s+paulo|belo\s+horizonte|londrina)\b/i.test(l) ||
        // Remove phone numbers
        /\(?\d{2}\)?\s*9?\s*\d{4}[-.\s]?\d{4}/.test(l) ||
        // Remove WhatsApp contact lines
        (/\b(whats|contato|fone|tel|liga|chama)\b/i.test(l) && /\d{4}/.test(l)) ||
        // Remove repasse/group lines
        /\b(repasse|grupo\s+de|lista\s+de|entre\s+em\s+contato)\b/i.test(l)
      ) {
        continue;
      }

      bodyLines.push(l);
    }

    // Trim trailing empty lines
    while (bodyLines.length > 0 && !bodyLines[bodyLines.length - 1]) {
      bodyLines.pop();
    }
    // Trim leading empty lines
    while (bodyLines.length > 0 && !bodyLines[0]) {
      bodyLines.shift();
    }

    if (bodyLines.length > 0) {
      lines.push("");
      lines.push(...bodyLines);
    } else if (featuresList.length > 0) {
      // A limpeza removeu TODAS as linhas do anuncio original (anuncio era
      // so preco/negociacao/contato). Usa as features extraidas pela IA pra
      // o anuncio nao sair vazio.
      lines.push("");
      featuresList.forEach((f) => lines.push(f));
    }
  } else if (featuresList.length > 0) {
    // Fallback: if no rawDescription, use AI-extracted features
    lines.push("");
    featuresList.forEach((f) => lines.push(f));
  }

  lines.push("");

  if (vehicle.fipePrice != null) {
    lines.push(`Fipe: ${priceFormatted(vehicle.fipePrice)}`);
  }

  // Bold price for WhatsApp
  lines.push(`Por: *${sellingPriceFmt}*`);

  return lines.join("\n");
}
