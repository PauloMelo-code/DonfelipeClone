// ---------------------------------------------------------------------------
// O cambio do carro, lido do anuncio.
//
// "Manual" e a palavra mais traicoeira do anuncio de repasse: "manual do
// proprietario", "manual e chave reserva" e "sem manual" sao ITENS, nao
// cambio. "Automatico" engana do mesmo jeito: "ar digital automatico",
// "farol automatico". Por isso os itens saem do texto antes da leitura.
// ---------------------------------------------------------------------------

export type Cambio = "AUTOMATICO" | "MANUAL" | "CVT";

/**
 * Carro eletrico -- que nao existe com cambio manual. "Trava eletrica",
 * "direcao eletrica" e "banco eletrico" sao itens: so conta o carro.
 */
export const ELETRICO =
  /\b(e-?tron|taycan|tesla|ioniq\s*[56]|dolphin|byd\s+seal|leaf|bolt\s+ev|zs\s+ev)\b|\bid\.\s?[3-7]\b|\b100\s*%\s*el[eé]tric|\b(carro|ve[ií]culo|suv|sed[aã]n|hatch|modelo)\s+(100\s*%\s*)?el[eé]tric[oa]\b|^\s*el[eé]tric[oa]\s*$/im;

// "manual" colado a um item de documentacao ou a "sem"/"com".
const MANUAL_ANTES_DE_ITEM =
  /\b(?:sem|com|c\/|acompanha|possui|tem)?\s*manua(?:l|is)\b(?=[\s,+&/e-]*(?:do\s+propriet|de\s+instru|do\s+dono|original|chave|c[oó]pia|reserva|nota))/gi;
const MANUAL_DEPOIS_DE_ITEM =
  /\bchaves?(?:\s+(?:reserva|c[oó]pia|extra))?\s*(?:e|\+|&|,|\/)\s*manua(?:l|is)\b/gi;
const MANUAL_COMO_ITEM = /\b(?:sem|com|c\/|acompanha|possui|tem)\s+manua(?:l|is)\b/gi;

// "ar digital automatico", "farol automatico": o automatico e do item.
const AUTOMATICO_DE_ITEM =
  /\b(?:ar|climatiza\w*|farol|far[oó]is|luz(?:es)?|limpador\w*|abertura|porta\w*|tampa|bancos?|estaciona\w*|piloto|freio|vidros?|retrovisor\w*|acendimento|partida|desemba[çc]ador)\b(?:\s+\S+){0,2}?\s+autom[aá]tic[oa]s?\b/gi;

export function detectarCambio(texto: string): Cambio | undefined {
  const limpo = texto
    .replace(MANUAL_ANTES_DE_ITEM, " ")
    .replace(MANUAL_DEPOIS_DE_ITEM, " ")
    .replace(MANUAL_COMO_ITEM, " ")
    .replace(AUTOMATICO_DE_ITEM, " ");

  if (/\bcvt\b/i.test(limpo)) return "CVT";
  if (
    /\b(autom[aá]tic[oa]|aut\.?|tiptronic|steptronic|dsg|s[\s-]?tronic|powershift|automatizad[oa]|dualogic|easytronic)\b/i.test(limpo) ||
    // "1.0 AT", "2.0T AT6"
    /\b\d\.\d\s*(?:t|tb|turbo)?\s*at\d?\b/i.test(limpo) ||
    /\bat[6-9]\b/i.test(limpo) ||
    // "Autom." e "Aut." abreviados -- o \b nao serve depois do ponto.
    /\baut(?:om)?\.(?!\w)/i.test(limpo)
  ) {
    return "AUTOMATICO";
  }
  // "Mec." abreviado e cambio; "mecanica boa" e motor, por isso so a abreviacao
  // solta e o rotulo explicito valem.
  if (/\bmanual\b/i.test(limpo) || /\bmec\.(?!\w)/i.test(limpo) || /\bc[aâ]mbio\s*:?\s*mec[aâ]nic[oa]\b/i.test(limpo)) return "MANUAL";
  if (ELETRICO.test(texto)) return "AUTOMATICO";
  return undefined;
}

/**
 * Como cada combustivel aparece escrito, e como ele vai no titulo. "Álcool"
 * comeca com acento: o \b do JS nao serve, o limite e por letra.
 */
export const COMBUSTIVEL_ESCRITO: Record<string, { rotulo: string; escrito: RegExp }> = {
  FLEX: { rotulo: "Flex", escrito: /(?<!\p{L})flex(?!\p{L})/iu },
  DIESEL: { rotulo: "Diesel", escrito: /(?<!\p{L})diesel(?!\p{L})/iu },
  GASOLINA: { rotulo: "Gasolina", escrito: /(?<!\p{L})gasolina(?!\p{L})/iu },
  ETANOL: { rotulo: "Etanol", escrito: /(?<!\p{L})(etanol|[aá]lcool)(?!\p{L})/iu },
};

/**
 * Combustivel so vale ESCRITO no anuncio -- ele vai no titulo. O cliente
 * (21/09/2026): "a IA nao sabe os carros que sao flex ou diesel", e a Toro
 * existe nos dois. Hibrido e eletrico passam: mudam o rotulo do cambio, e o
 * eletrico e reconhecido pelo nome do modelo.
 */
export function combustivelConfirmado(fuel: string | null | undefined, texto: string | null | undefined): string | undefined {
  const c = fuel ? COMBUSTIVEL_ESCRITO[fuel] : undefined;
  if (c && !(texto && c.escrito.test(texto))) return undefined;
  return fuel ?? undefined;
}

/**
 * "Manual" so vale ESCRITO no anuncio. A IA chuta manual pelo modelo, e
 * "manual e chave copia" a induz: uma Rampage automatica foi publicada como
 * "(manual)". Automatico e CVT ficam -- o chute por modelo acerta neles.
 */
export function cambioConfirmado(cambio: string | undefined, texto: string): string | undefined {
  if (cambio === "MANUAL" && detectarCambio(texto) !== "MANUAL") return undefined;
  return cambio;
}
