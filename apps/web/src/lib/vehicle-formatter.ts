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
 * Format a short price string in the Brazilian "99.9k" notation.
 *
 * Examples:
 *   127000  -> "127k"
 *    99900  -> "99.9k"
 *   185500  -> "185.5k"
 *  1200000  -> "1.200k"
 */
function priceShort(value: number): string {
  const thousands = value / 1000;

  // If it's a whole number of thousands, drop the decimal
  if (Number.isInteger(thousands)) {
    return `${thousands.toLocaleString("pt-BR")}k`;
  }

  // One decimal place, remove trailing zero after decimal if present
  const formatted = thousands.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  return `${formatted}k`;
}

/**
 * Format a full price string in Brazilian Real notation.
 *
 * Examples:
 *   127000  -> "R$ 127.000"
 *    99900  -> "R$ 99.900"
 */
function priceFormatted(value: number): string {
  return `R$ ${Math.round(value).toLocaleString("pt-BR")}`;
}

/**
 * Format km in pt-BR locale: 45000 -> "45.000"
 */
function kmFormatted(km: number): string {
  return km.toLocaleString("pt-BR");
}

/**
 * Get the last two digits of a year: 2024 -> "24"
 */
function yearShort(year: number): string {
  return String(year).slice(-2);
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
    return "HIBRIDO";
  }

  switch (transmission) {
    case "AUTOMATICO":
      return "AUT";
    case "MANUAL":
      return "MEC";
    case "CVT":
      return "CVT";
    default:
      return "AUT"; // sensible default for Brazilian market
  }
}

/**
 * Build the short model name from the full model.
 * Takes the first two words, uppercased.
 * e.g. "Civic EXL 2.0 16V" -> "CIVIC EXL"
 */
function modelShort(model: string): string {
  const parts = model.trim().split(/\s+/);
  return parts.slice(0, 2).join(" ").toUpperCase();
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
  },
  settings: FormatSettings
): string {
  // --- Computed values ---
  const sellingPrice = vehicle.price * (1 + settings.profitMarginPercent / 100);
  const transmissionLabel = getTransmissionLabel(
    vehicle.fuel ?? undefined,
    vehicle.transmission ?? undefined
  );
  const shortModel = modelShort(vehicle.model);
  const fullModel = vehicle.model.toUpperCase();
  const yShort = yearShort(vehicle.year);
  const kmFmt = kmFormatted(vehicle.km);
  const pShort = priceShort(sellingPrice);
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

  const featuresBlock = featuresList
    .map((f) => `\u2022 ${f}`)
    .join("\n");

  // --- Year display ---
  const yearDisplay = vehicle.yearModel
    ? `${vehicle.year}/${vehicle.yearModel}`
    : `${vehicle.year}`;

  // --- FIPE line ---
  const fipeLine =
    vehicle.fipePrice != null
      ? `FIPE: ${priceFormatted(vehicle.fipePrice)}`
      : null;

  // --- Build ad ---
  const lines: string[] = [
    `\uD83D\uDE97 ${shortModel} '${yShort} | ${kmFmt} KM | ${pShort}`,
    "",
    `${fullModel} ${transmissionLabel}`,
    `Ano: ${yearDisplay}`,
    `Km: ${kmFmt}`,
  ];

  if (featuresBlock) {
    lines.push("", featuresBlock);
  }

  lines.push("");

  if (fipeLine) {
    lines.push(fipeLine);
  }

  lines.push(`POR: ${sellingPriceFmt}`);

  return lines.join("\n");
}
