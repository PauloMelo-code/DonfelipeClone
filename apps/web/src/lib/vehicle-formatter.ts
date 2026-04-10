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
    return "Híbrido";
  }

  switch (transmission) {
    case "AUTOMATICO":
      return "Automático";
    case "MANUAL":
      return "Manual";
    case "CVT":
      return "CVT";
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

  // --- First line: model + transmission (bold for WhatsApp) ---
  const modelLine = transmissionLabel
    ? `*${vehicle.model} ${transmissionLabel}*`
    : `*${vehicle.model}*`;

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
      .replace(/\*/g, "")
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
        // KM line: "KM 35.000" or "35.000 km" or "35mil km"
        /^(km\s*)?[\d.,]+\s*(mil\s*)?(km)?\s*$/i.test(l) ||
        // Price lines: "R$ 360.900" "Pedida R$ 360.900" "Fipe R$ 381.000" "Faço R$ 65.900"
        /^(fipe|pedida|faço|valor|preco|preço|por)\s*:?\s*r?\$?\s*[\d.,]+/i.test(l) ||
        // Bare price: "R$ 360.900" or just "360.900"
        /^r?\$?\s*[\d.,]+\s*(mil|reais)?\s*$/i.test(l) ||
        // Location pin: "SP" or "📍 SP" (emoji already stripped, so just "SP")
        /^[A-Z]{2}$/i.test(l) && l.length === 2 ||
        // Transmission/fuel already in title
        /^(automático|automatico|manual|cvt|flex|diesel|híbrido|hibrido)\s*$/i.test(l)
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
