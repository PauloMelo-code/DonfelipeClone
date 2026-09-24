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

/**
 * As referencias que definem a nota. O cliente edita na tela de
 * Configuracoes (23/09/2026: "as referencias estao erradas") -- o que cada
 * faixa VALE em pontos continua fixo; o que muda e onde cada faixa comeca.
 */
export interface CriteriosDoScore {
  /** Km ate aqui e "muito baixa" (+2). */
  kmMuitoBaixa: number;
  /** Km ate aqui e "baixa" (+1). */
  kmBaixa: number;
  /** Acima disto, "km alta" (-1). */
  kmAlta: number;
  /** Acima disto, "km muito alta" (-2). */
  kmMuitoAlta: number;
  /** Ate tantos anos, "carro novo" (+1). */
  idadeNovo: number;
  /** A partir de tantos anos, "carro antigo" (-1). */
  idadeAntigo: number;
  /** Desconto da FIPE que ja e bom, em % (+2). */
  descontoBom: number;
  /** Desconto da FIPE que e excelente, em % (+3). */
  descontoExcelente: number;
}

export const CRITERIOS_PADRAO: CriteriosDoScore = {
  kmMuitoBaixa: 30000,
  kmBaixa: 60000,
  kmAlta: 100000,
  kmMuitoAlta: 150000,
  idadeNovo: 2,
  idadeAntigo: 8,
  descontoBom: 10,
  descontoExcelente: 15,
};

/** A chave de configuracao de cada criterio. */
export const CHAVE_DO_CRITERIO: Record<keyof CriteriosDoScore, string> = {
  kmMuitoBaixa: "score_km_muito_baixa",
  kmBaixa: "score_km_baixa",
  kmAlta: "score_km_alta",
  kmMuitoAlta: "score_km_muito_alta",
  idadeNovo: "score_idade_novo",
  idadeAntigo: "score_idade_antigo",
  descontoBom: "score_desconto_bom",
  descontoExcelente: "score_desconto_excelente",
};

/**
 * Os criterios a partir das configuracoes guardadas. Uma implementacao so: o
 * servidor passa as linhas do banco, a tela passa o que veio de /api/settings.
 * Valor ausente, vazio ou invalido cai no padrao.
 */
export function criteriosDoScore(guardado: Record<string, unknown> = {}): CriteriosDoScore {
  const lido = { ...CRITERIOS_PADRAO };
  for (const campo of Object.keys(CRITERIOS_PADRAO) as (keyof CriteriosDoScore)[]) {
    const n = Number(guardado[CHAVE_DO_CRITERIO[campo]]);
    if (Number.isFinite(n) && n > 0) lido[campo] = n;
  }
  return lido;
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
export function calculateQualityScore(
  v: QualityInput,
  criterios: CriteriosDoScore = CRITERIOS_PADRAO
): { score: number; reasons: string[] } {
  let score = 5; // base
  const reasons: string[] = [];

  // KM (peso 3)
  if (v.km < criterios.kmMuitoBaixa) { score += 2; reasons.push("Km muito baixa"); }
  else if (v.km < criterios.kmBaixa) { score += 1; reasons.push("Km baixa"); }
  else if (v.km > criterios.kmMuitoAlta) { score -= 2; reasons.push("Km muito alta"); }
  else if (v.km > criterios.kmAlta) { score -= 1; reasons.push("Km alta"); }

  // Idade (peso 2)
  const currentYear = new Date().getFullYear();
  const age = currentYear - v.year;
  if (age <= criterios.idadeNovo) { score += 1; reasons.push("Carro novo"); }
  else if (age >= criterios.idadeAntigo) { score -= 1; reasons.push("Carro antigo"); }

  // Desconto FIPE (peso 3). Minimo esperado: 10% abaixo da tabela.
  if (v.fipePrice && v.fipePrice > 0) {
    const discount = (1 - v.price / v.fipePrice) * 100;
    if (discount >= criterios.descontoExcelente) { score += 3; reasons.push(`Desconto excelente (${Math.round(discount)}%)`); }
    else if (discount >= criterios.descontoBom) { score += 2; reasons.push(`Bom desconto FIPE (${Math.round(discount)}%)`); }
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
