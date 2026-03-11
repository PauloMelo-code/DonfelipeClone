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
  features: string[];
  photos: string[];
  rawDescription?: string;
  sellerPhone?: string;
}

interface FilterCriteria {
  minYear?: number;
  maxYear?: number;
  minPrice?: number;
  maxPrice?: number;
  minKm?: number;
  maxKm?: number;
  models?: string[];
  excludeModels?: string[];
}

// ---------------------------------------------------------------------------
// Filter Logic
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a vehicle matches the given filter criteria.
 * Returns true if the vehicle passes ALL active filters.
 */
export function applyFilters(
  vehicle: VehicleData,
  filters: FilterCriteria
): boolean {
  // Year range
  if (filters.minYear != null && vehicle.year < filters.minYear) {
    return false;
  }
  if (filters.maxYear != null && vehicle.year > filters.maxYear) {
    return false;
  }

  // Price range
  if (filters.minPrice != null && vehicle.price < filters.minPrice) {
    return false;
  }
  if (filters.maxPrice != null && vehicle.price > filters.maxPrice) {
    return false;
  }

  // KM range
  if (filters.minKm != null && vehicle.km < filters.minKm) {
    return false;
  }
  if (filters.maxKm != null && vehicle.km > filters.maxKm) {
    return false;
  }

  // Allowlist: vehicle model must contain at least one of the specified strings
  if (filters.models && filters.models.length > 0) {
    const modelUpper = vehicle.model.toUpperCase();
    const matchesAny = filters.models.some((m) =>
      modelUpper.includes(m.toUpperCase())
    );
    if (!matchesAny) {
      return false;
    }
  }

  // Blocklist: vehicle model must NOT contain any of the excluded strings
  if (filters.excludeModels && filters.excludeModels.length > 0) {
    const modelUpper = vehicle.model.toUpperCase();
    const matchesExcluded = filters.excludeModels.some((m) =>
      modelUpper.includes(m.toUpperCase())
    );
    if (matchesExcluded) {
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Quick Regex Parser (fallback when AI is unavailable)
// ---------------------------------------------------------------------------

/**
 * Parse vehicle information from Brazilian-format text using regex patterns.
 * This is a best-effort fallback -- it will not extract every field.
 */
export function quickParseVehicleText(text: string): Partial<VehicleData> {
  const result: Partial<VehicleData> = {};

  // ---- Year ----
  // Match patterns like "2020/2021", "20/21", "2020", or "ano 2020"
  const yearFullMatch = text.match(
    /(\d{4})\s*[\/\\]\s*(\d{4})/
  );
  const yearShortMatch = text.match(
    /(\d{2})\s*[\/\\]\s*(\d{2})(?!\d)/
  );
  const yearSingleMatch = text.match(
    /(?:ano|ANO|Ano)[:\s]*(\d{4})/
  );
  const yearStandaloneMatch = text.match(
    /\b(20[0-2]\d)\b/
  );

  if (yearFullMatch) {
    result.year = parseInt(yearFullMatch[1], 10);
    result.yearModel = parseInt(yearFullMatch[2], 10);
  } else if (yearShortMatch) {
    const y1 = parseInt(yearShortMatch[1], 10);
    const y2 = parseInt(yearShortMatch[2], 10);
    result.year = y1 < 50 ? 2000 + y1 : 1900 + y1;
    result.yearModel = y2 < 50 ? 2000 + y2 : 1900 + y2;
  } else if (yearSingleMatch) {
    result.year = parseInt(yearSingleMatch[1], 10);
  } else if (yearStandaloneMatch) {
    result.year = parseInt(yearStandaloneMatch[1], 10);
  }

  // ---- Kilometragem ----
  // "45.000km", "45.000 km", "45mil km", "45000km"
  const kmDottedMatch = text.match(
    /(\d{1,3}(?:\.\d{3})+)\s*(?:km|KM|Km)/
  );
  const kmMilMatch = text.match(
    /(\d{1,3})\s*(?:mil)\s*(?:km|KM|Km)/i
  );
  const kmPlainMatch = text.match(
    /(\d{4,6})\s*(?:km|KM|Km)/
  );

  if (kmDottedMatch) {
    result.km = parseInt(kmDottedMatch[1].replace(/\./g, ""), 10);
  } else if (kmMilMatch) {
    result.km = parseInt(kmMilMatch[1], 10) * 1000;
  } else if (kmPlainMatch) {
    result.km = parseInt(kmPlainMatch[1], 10);
  }

  // ---- Price ----
  // "R$ 85.000", "R$85000", "85mil", "85.000", "99.9k", "99,9k"
  const priceReaisMatch = text.match(
    /R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)/
  );
  const priceMilMatch = text.match(
    /(\d{1,3})\s*mil\b/i
  );
  const priceKMatch = text.match(
    /(\d{1,3}[.,]\d{1,2})\s*[kK]/
  );
  const pricePlainMatch = text.match(
    /R\$\s*(\d{4,7})/
  );

  if (priceReaisMatch) {
    result.price = parseFloat(
      priceReaisMatch[1].replace(/\./g, "").replace(",", ".")
    );
  } else if (priceKMatch) {
    const numStr = priceKMatch[1].replace(",", ".");
    result.price = Math.round(parseFloat(numStr) * 1000);
  } else if (priceMilMatch) {
    result.price = parseInt(priceMilMatch[1], 10) * 1000;
  } else if (pricePlainMatch) {
    result.price = parseInt(pricePlainMatch[1], 10);
  }

  // ---- Transmission ----
  const textUpper = text.toUpperCase();
  if (/\bCVT\b/.test(textUpper)) {
    result.transmission = "CVT";
  } else if (/\b(?:AUT(?:OMATICO|OMATIC)?|AUT\.?)\b/.test(textUpper)) {
    result.transmission = "AUTOMATICO";
  } else if (/\b(?:MANUAL|MEC(?:ANICO)?|MEC\.?)\b/.test(textUpper)) {
    result.transmission = "MANUAL";
  }

  // ---- Fuel ----
  if (/\bHIBRIDO\b/.test(textUpper) || /\bH[IÍ]BRIDO\b/.test(textUpper)) {
    result.fuel = "HIBRIDO";
  } else if (/\bEL[EÉ]TRICO\b/.test(textUpper)) {
    result.fuel = "ELETRICO";
  } else if (/\bDIESEL\b/.test(textUpper)) {
    result.fuel = "DIESEL";
  } else if (/\bFLEX\b/.test(textUpper)) {
    result.fuel = "FLEX";
  } else if (/\bETANOL\b/.test(textUpper) || /\b[AÁ]LCOOL\b/.test(textUpper)) {
    result.fuel = "ETANOL";
  } else if (/\bGASOLINA\b/.test(textUpper)) {
    result.fuel = "GASOLINA";
  }

  // ---- Phone ----
  const phoneMatch = text.match(
    /(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4,5}[-.\s]?\d{4}/
  );
  if (phoneMatch) {
    result.sellerPhone = phoneMatch[0].replace(/[\s()-]/g, "");
  }

  return result;
}
