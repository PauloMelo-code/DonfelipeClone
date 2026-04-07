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
  const lines: string[] = [
    modelLine,
    `${yearDisplay} | ${kmFmt}km`,
  ];

  if (featuresList.length > 0) {
    lines.push("");
    featuresList.forEach((f) => lines.push(f));
  }

  if (vehicle.rawDescription?.trim()) {
    lines.push("");
    lines.push(vehicle.rawDescription.trim());
  }

  lines.push("");

  if (vehicle.fipePrice != null) {
    lines.push(`Fipe: ${priceFormatted(vehicle.fipePrice)}`);
  }

  // Bold price for WhatsApp
  lines.push(`Por: *${sellingPriceFmt}*`);

  return lines.join("\n");
}
