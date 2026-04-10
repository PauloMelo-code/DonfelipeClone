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
    // Use the original seller description as the ad body.
    // Remove the first few lines that overlap with our structured header
    // (model, year, km are already shown above).
    // Sanitize stray * that would break WhatsApp bold markers.
    const sanitized = vehicle.rawDescription.trim().replace(/\*/g, "");

    // Try to strip redundant header lines (model/year/km/price that we already show)
    const descLines = sanitized.split("\n");
    const bodyLines: string[] = [];
    for (const line of descLines) {
      const l = line.trim().toLowerCase();
      // Skip empty lines at the start
      if (bodyLines.length === 0 && !l) continue;
      // Skip lines that are just the model name, year, km, or price we already display
      if (bodyLines.length === 0) {
        const isRedundant =
          l.includes(vehicle.model.toLowerCase().split(" ")[0]) ||
          /^\d{4}\s*[\/\|]\s*\d{2,4}$/.test(l) ||
          /^r?\$?\s*[\d.,]+\s*(mil|reais)?$/.test(l);
        if (isRedundant) continue;
      }
      bodyLines.push(line);
    }

    // Remove trailing empty lines
    while (bodyLines.length > 0 && !bodyLines[bodyLines.length - 1].trim()) {
      bodyLines.pop();
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
