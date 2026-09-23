// ---------------------------------------------------------------------------
// A nota do carro, de 0 a 10.
//
// O cliente pegou uma Sportage 2018, 91 mil km, 16% abaixo da FIPE, com nota
// 2/10 (22/09/2026). O anuncio dizia "SEM SINISTRO" e "SEM LEILÃO", e a nota
// lia so as palavras "sinistro" e "leilão": tirava 5 pontos do carro por ele
// NAO ter passado por leilao. Agora a negacao antes da palavra conta.
//
// `reasons` explica cada ponto -- e o que a tela mostra quando ele pergunta
// por que a nota e essa.
// ---------------------------------------------------------------------------

/** Palavra que derruba a nota... quando o carro TEM aquilo. */
const RISCO = /\b(leil[aã]o|sinistr\w*|batid[oa]s?|enchente|recuperad[oa]s?|(?:m[ée]dia|pequena)\s+monta)\b/gi;
/** "Sem", "não tem", "nunca passou por" logo antes: o carro nao tem aquilo. */
const NEGADO_ANTES =
  /\b(?:sem|s\/|n[ãa]o(?:\s+(?:tem|possui|teve))?|nunca(?:\s+\w+){0,2}|zero|nenhum[a]?|livre\s+de|nada\s+de)\s+(?:passagem\s+(?:por|em|de)\s+)?$/i;

/** O anuncio diz que o carro TEM leilao/sinistro, ou diz que NAO tem? */
export function temSinalDeRisco(descricao: string): boolean {
  for (const achado of descricao.matchAll(RISCO)) {
    const antes = descricao.slice(Math.max(0, (achado.index ?? 0) - 40), achado.index);
    if (!NEGADO_ANTES.test(antes)) return true;
  }
  return false;
}

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
    if (temSinalDeRisco(desc)) {
      score -= 5; reasons.push("Sinais de risco (leilão/sinistro)");
    }
    // O \b do JS nao enxerga o "Ú" acentuado: "único dono" nunca pontuava.
    if (/(?<![a-zà-ú])([uú]nic[oa]\s*don[oa]|proced[êe]ncia)(?![a-zà-ú])/i.test(desc)) {
      score += 1; reasons.push("Único dono");
    }
    if (/\b(revisado|revis[oõ]es|laudo\s*aprovado|dekra|cautelar)\b/i.test(desc)) {
      score += 1; reasons.push("Revisado/laudo");
    }
  }

  return {
    score: Math.max(0, Math.min(10, Math.round(score))),
    reasons,
  };
}
