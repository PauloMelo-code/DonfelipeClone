// ---------------------------------------------------------------------------
// "Sem leilão" nao e leilão.
//
// O sistema ja errou isso duas vezes, e das duas o prejuizo foi do lado ruim:
// o anuncio que dizia "SEM RETOQUE" saiu com "Fazer 1 retoque", e a nota do
// carro caiu 5 pontos porque o texto dizia "SEM SINISTRO". A palavra sozinha
// nao decide nada -- o que vem antes dela decide.
//
// Aqui fica a leitura da negacao, para todo mundo usar a mesma.
// ---------------------------------------------------------------------------

/** "sem", "não tem", "nunca passou por", "livre de" logo antes da palavra. */
const NEGADO_ANTES =
  /(?:^|[\s,;:.!?([-])(?:sem|s\/|nem|n[ãa]o(?:\s+(?:tem|possui|teve))?|nunca(?:\s+\w+){0,2}|zero|nenhum[a]?|livre\s+de|nada\s+de|isent[oa]\s+de)\s+(?:passagem\s+(?:por|em|de)\s+)?$/i;

/** Quantos caracteres antes da palavra sao olhados em busca da negacao. */
const JANELA = 40;

/**
 * A palavra esta no texto AFIRMADA, ou aparece negada?
 *
 * `termo` precisa ser uma expressao global (com `g`), para varrer todas as
 * ocorrencias: "Sem leilão. Sinistro recuperado" tem as duas coisas, e a
 * segunda conta.
 */
export function citadoSemNegacao(texto: string, termo: RegExp): boolean {
  const busca = new RegExp(termo.source, termo.flags.includes("g") ? termo.flags : `${termo.flags}g`);
  for (const achado of texto.matchAll(busca)) {
    const antes = texto.slice(Math.max(0, (achado.index ?? 0) - JANELA), achado.index);
    if (!NEGADO_ANTES.test(antes)) return true;
  }
  return false;
}

/** A mesma pergunta para um texto solto, comparando palavra inteira. */
export function palavraCitadaSemNegacao(texto: string, palavra: string): boolean {
  const escapada = palavra.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Limite por LETRA, nao \b: "leilão" acaba em vogal acentuada, e o \b do JS
  // nao enxerga acento -- a palavra nunca casaria no fim da frase.
  return citadoSemNegacao(texto, new RegExp(`(?<![a-zà-ú0-9])${escapada}(?![a-zà-ú0-9])`, "giu"));
}
