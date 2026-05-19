interface QualityInput {
  km: number;
  year: number;
  price: number;
  fipePrice?: number | null;
  rawDescription?: string | null;
}

/**
 * Score 0-10 baseado em km, idade, desconto FIPE, palavras-chave.
 * 10 = oportunidade incrivel | 0 = nao recomendado
 */
export function calculateQualityScore(v: QualityInput): { score: number; reasons: string[] } {
  let score = 5; // base
  const reasons: string[] = [];

  // KM (peso 3)
  if (v.km < 30000) { score += 2; reasons.push("Km muito baixa"); }
  else if (v.km < 60000) { score += 1; reasons.push("Km baixa"); }
  else if (v.km > 150000) { score -= 2; reasons.push("Km muito alta"); }
  else if (v.km > 100000) { score -= 1; reasons.push("Km alta"); }

  // Idade (peso 2)
  const currentYear = new Date().getFullYear();
  const age = currentYear - v.year;
  if (age <= 2) { score += 1; reasons.push("Carro novo"); }
  else if (age >= 8) { score -= 1; reasons.push("Carro antigo"); }

  // Desconto FIPE (peso 3). Minimo esperado: 10% abaixo da tabela.
  if (v.fipePrice && v.fipePrice > 0) {
    const discount = (1 - v.price / v.fipePrice) * 100;
    if (discount >= 15) { score += 3; reasons.push(`Desconto excelente (${Math.round(discount)}%)`); }
    else if (discount >= 10) { score += 2; reasons.push(`Bom desconto FIPE`); }
    else if (discount >= 0) { score -= 1; reasons.push(`Pouco desconto FIPE (${Math.round(discount)}%)`); }
    else { score -= 3; reasons.push("Acima da FIPE"); }
  }

  // Bandeiras vermelhas no texto (peso -3)
  if (v.rawDescription) {
    const desc = v.rawDescription.toLowerCase();
    if (/\b(leil[aã]o|sinistro|batido|enchente|recuperado)\b/i.test(desc)) {
      score -= 5; reasons.push("⚠️ Sinais de risco (leilao/sinistro)");
    }
    if (/\b(unico\s*dono|único\s*dono|procedencia)\b/i.test(desc)) {
      score += 1; reasons.push("Único dono");
    }
    if (/\b(revisado|revis[oõ]es|laudo\s*aprovado)\b/i.test(desc)) {
      score += 1; reasons.push("Revisado/laudo");
    }
  }

  return {
    score: Math.max(0, Math.min(10, Math.round(score))),
    reasons,
  };
}
