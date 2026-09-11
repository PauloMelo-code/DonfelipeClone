// ---------------------------------------------------------------------------
// Leitura de numero em formato brasileiro.
//
// O ponto e separador de milhar e a virgula e decimal: "48.990,50" e quarenta
// e oito mil, nao quarenta e oito. Errar isto vira preco de carro absurdo.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Brazilian Number Parser
// ---------------------------------------------------------------------------

export function parseBrazilianNumber(raw: string): number | null {
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

  // Brazilian format. Casos suportados:
  //   "127.000"      -> 127000   (pontos = milhar)
  //   "127.000,00"   -> 127000   (virgula = decimal)
  //   "65.500"       -> 65500
  //   "78.200.00"    -> 78200    (ponto duplo: ultimo eh DECIMAL, nao milhar)
  //   "78.200.000"   -> 78200000 (ponto duplo: ultimo com 3 digitos = milhar)
  //   "78,200.00"    -> 78200    (formato US misturado: virgula milhar, ponto decimal)
  const hasComma = s.includes(",");
  const dots = (s.match(/\./g) || []).length;

  if (!hasComma && dots >= 2) {
    // Multiplos pontos sem virgula -- ambiguo. Heuristica:
    //   se o ultimo grupo apos o ponto tem 1-2 digitos = decimal
    //   se tem 3 digitos = milhar
    const lastDot = s.lastIndexOf(".");
    const tail = s.slice(lastDot + 1);
    if (/^\d{1,2}$/.test(tail)) {
      // "78.200.00" -> "78200.00" -> 78200
      s = s.slice(0, lastDot).replace(/\./g, "") + "." + tail;
    } else {
      // "78.200.000" -> "78200000"
      s = s.replace(/\./g, "");
    }
  } else if (!hasComma && dots === 1) {
    // 1 ponto, sem virgula -- ainda pode ser decimal se grupo tem 1-2 digitos
    // Ex: "12.50" -> 12.50 (decimal) vs "12.500" -> 12500 (milhar)
    const tail = s.slice(s.indexOf(".") + 1);
    if (/^\d{1,2}$/.test(tail)) {
      // mantem como float: "12.50" -> 12.50
    } else {
      // milhar: "12.500" -> "12500"
      s = s.replace(/\./g, "");
    }
  } else {
    // Padrao PT-BR: pontos = milhar, virgula = decimal
    s = s.replace(/\./g, "").replace(",", ".");
  }

  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Known Brands for Model Detection
// ---------------------------------------------------------------------------

/**
 * Helper standalone pra extrair APENAS o KM via regex.
 * Usado como validacao cruzada quando o GPT pode ter confundido com CV/HP.
 * Mesma logica da extractWithRegex parte de KM mas independente.
 */
export function extractKmFromText(text: string): number | null {
  const patterns: RegExp[] = [
    /\bquilometragem\s*:?\s*([\d.,]+)/i,
    /\b(\d{2,3})\s*mil\s*km\b/i,
    /\bkm\s*:?\s*([\d.,]+)/i,
    /\b([\d.,]+)\s*km\b/i,
    /\b([\d.,]+)\s*kms?\s*rodad/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (!m) continue;
    let n: number | null;
    if (/mil/i.test(m[0])) n = parseInt(m[1]) * 1000;
    else n = parseBrazilianNumber(m[1]);
    const raw = m[1].replace(/[.,\s]/g, "");
    // Pula ano (4 digitos 19xx/20xx)
    if (n !== null && raw.length === 4 && /^(19|20)\d{2}$/.test(raw)) continue;
    if (n !== null && n >= 1000 && n <= 999999) return n;
  }
  return null;
}
