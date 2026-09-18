// ---------------------------------------------------------------------------
// O padrao do CORPO do anuncio.
//
// E a lista de 15 regras que o cliente mandou em 18/09/2026, em codigo. Fica
// aqui, e nao so no prompt, por dois motivos: o anuncio tem que sair igual
// com ou sem IA (o caminho por regex usa as mesmas funcoes), e a IA ja provou
// que troca o sentido do que reescreve -- "Polimento" virou "Polimento
// recente", "Faz 3 peças" virou "Motor com 3 peças trocadas".
//
// Tres pecas:
//   padronizar()   uma linha do vendedor -> a(s) linha(s) no padrao
//   eAFazer()      a linha e do bloco de baixo (o que o carro precisa)?
//   montarCorpo()  dois blocos: o bom do curto pro longo, linha em branco,
//                  o a fazer do longo pro curto
// ---------------------------------------------------------------------------

const NUMEROS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, "três": 3, quatro: 4, cinco: 5, seis: 6,
};
const N = String.raw`(\d+|uma?|dois|duas|tr[eê]s|quatro|cinco|seis)`;
const numero = (s?: string) => (s ? (/^\d+$/.test(s) ? Number(s) : NUMEROS[s.toLowerCase()]) : undefined);
const pecas = (n?: number) => (n === 1 ? "peça" : "peças");
const NEGADO = /^(sem|s\/|zero|nenhum[a]?|n[ãa]o\s+tem|nunca)\b/i;

// ── 1 e 15. Maiusculas ─────────────────────────────────────────────────────
// Sigla que fica inteira em maiusculas no corpo.
const SIGLAS = new Set([
  "IPVA", "ABS", "LED", "GPS", "AT", "MT", "TFT", "USB", "CVT", "DVD", "AWD", "ACC", "GNV",
  "CRLV", "DUT", "OK", "CSS", "RS", "SC", "PR", "SP", "MG", "RJ", "DF", "GO", "MS", "BA", "CE",
]);
const LIGACAO = new Set(["DO", "DA", "DE", "NO", "NA", "EM", "E"]);

function frasear(l: string): string {
  const letras = l.replace(/[^A-Za-zÀ-ú]/g, "");
  const todaMaiuscula = letras.length >= 2 && letras === letras.toUpperCase();
  const dePlaca = /^placa\b/i.test(l);
  const r = l
    .split(/(\s+)/)
    .map((p) => {
      const nu = p.replace(/[^A-Za-zÀ-ú0-9]/g, "");
      if (/^xbri$/i.test(nu)) return p.replace(/xbri/i, "XBri");
      if (nu.length < 2 || nu !== nu.toUpperCase() || !/[A-ZÀ-Ú]/.test(nu)) return p;
      if (/^4x[24]$/i.test(nu)) return p.toLowerCase();
      if (/\d/.test(nu) || SIGLAS.has(nu)) return p; // "V6", "T270", "IPVA"
      // "Placa PE", "Placa J do RS": letra e estado da placa ficam.
      if (dePlaca && nu.length <= 2 && !LIGACAO.has(nu)) return p;
      // Sigla desconhecida numa linha escrita normal fica ("Pneus BF").
      if (!todaMaiuscula && nu.length <= 3) return p;
      return p.toLowerCase();
    })
    .join("");
  return r.replace(/^([^A-Za-zÀ-ú]*)([a-zà-ú])/, (_, antes, letra) => antes + letra.toUpperCase());
}

// ── Glossario do repasse ───────────────────────────────────────────────────
function glossario(l: string): string {
  let r = l.replace(/\bcss\b/gi, "concessionária").replace(/\bchave\s+c[oó]pia\b/gi, "chave reserva");
  if (/^manual\s+e\s+chave$/i.test(r)) r = "Manual e chave reserva";
  // "IPVA 2026 PAGO" -> "IPVA 26 pago", como o cliente escreve.
  if (!/\b(n[ãa]o|a\s+pagar|atrasad|vencid|abert|pendente|falta)/i.test(r)) {
    r = r.replace(
      /\bipva\s*(?:de\s*)?(?:20)?(\d{2})?\s*:?\s*(?:total\s*)?(?:pago|pg|quitad[oa]|ok)\b(?:\s*(?:20)?(\d{2})\b)?/i,
      (_, antes, depois) => `IPVA ${antes ?? depois ? `${antes ?? depois} ` : ""}pago`
    );
  }
  return r;
}

// ── 3. "OK" e informal: bom, boa, bons, boas ───────────────────────────────
const FEMININO =
  /^(caixa|lataria|pintura|mec[aâ]nica|el[eé]trica|bateria|estrutura|tape[çc]aria|funilaria|parte|carroceria|correia|bomba|turbina|capota|ca[çc]amba|multim[ií]dia|embreagem)s?$|([çs][ãa]o|gem|dade)$/i;

function okParaBom(l: string): string {
  const m = /^(.*?\S)\s*[:\-–]?\s*\b(?:est[áa]o?\s+|t[áa]\s+)?ok\b(.*)$/i.exec(l);
  if (!m) return l;
  const sujeito = m[1].replace(/\s+(tudo|td|100\s*%)$/i, "").trim();
  if (!/[a-zà-ú]{3}/i.test(sujeito) || /^(tudo|td)$/i.test(sujeito)) return l;
  const nucleos = sujeito.split(/\s*(?:,|\+|\/|\be\b)\s*/i).map((i) => i.trim().split(/\s+/)[0]).filter(Boolean);
  const feminino = nucleos.every((p) => FEMININO.test(p));
  const plural = nucleos.length > 1 || /s$/i.test(nucleos[0]);
  return `${sujeito} ${feminino ? (plural ? "boas" : "boa") : plural ? "bons" : "bom"}${m[2]}`;
}

// ── 2 e 8. Pintar x retocar ────────────────────────────────────────────────
// "Fazer", "refazer" ou so a quantidade de pecas e PINTAR. Falou em retoque,
// e RETOCAR -- a peca nao precisa de pintura inteira.
const PARTE = String.raw`(?:pe[çc]as?|para-?\s?choques?|parachoques?|cap[ôo]s?|portas?|para-?lamas?|tetos?|tampas?|laterais|lateral|colunas?|saias?|retrovisor(?:es)?|porta-?malas)`;
const TROCA = /\b(?:substitu[ií]d[ao]s?|substitui[çc][ãa]o|substituir|trocad[ao]s?|trocar?)(?:\s+d[ea]s?)?\b/i;

function retocar(l: string): string | null {
  if (NEGADO.test(l)) return null;
  // "Fazer dois retoques", "Faz 1 retoque", "Tem 2 retoques", "1 retoque"
  let m = new RegExp(`^(?:(?:faz(?:er)?|refaz(?:er)?|precisa(?:\\s+de)?|tem|com)\\s+)?(?:${N}\\s+)?(retoques?)$`, "i").exec(l);
  if (m) {
    const n = numero(m[1]) ?? (/s$/i.test(m[2]) ? undefined : 1);
    return n ? `Retocar ${n} ${pecas(n)}` : "Fazer retoques";
  }
  // "Retoque 2 peças", "Reforçar 1 peça", "Retoca uma peça", "Retoque no para-choque"
  m = new RegExp(
    `^(?:faz(?:er)?\\s+)?(?:retocar?|retoques?|refor[çc]ar|refor[çc]o)\\s+(?:(?:em|n[oa]s?|d[eao]s?)\\s+)?(?:${N}\\s+)?(.+)$`,
    "i"
  ).exec(l);
  if (!m) return null;
  const n = numero(m[1]);
  return `Retocar ${n ? `${n} ` : ""}${/^pe[çc]as?$/i.test(m[2]) ? pecas(n) : m[2]}`;
}

function pintar(bruta: string): string | null {
  if (/\bsem\s+pe[çc]/i.test(bruta)) return null;
  // "Uma peça substituída", "Substituição de duas peças", "Precisa trocar 1 peça":
  // no repasse, peca e peca pintada -- nunca "substituída".
  const trocada = TROCA.test(bruta) && /pe[çc]as?/i.test(bruta) && !/\bpint/i.test(bruta);
  const l = trocada ? bruta.replace(TROCA, " ").replace(/\s+/g, " ").trim() : bruta;
  // "Faz 2 peças", "Refazer 2 peças", "Fazer para-choque dianteiro", "Pintar duas peças"
  let m = new RegExp(
    `^(?:faz|fazer|refaz|refazer|pintar|precisa(?:\\s+de)?(?:\\s+pintar)?)\\s+(?:${N}\\s*x?\\s+)?(${PARTE}\\b.*)$`,
    "i"
  ).exec(l);
  // "2x peças", "1x Peças", "3 peças e pneus bons"
  m ??= new RegExp(`^${N}\\s*x?\\s*(pe[çc]as?\\b.*)$`, "i").exec(l);
  if (m) {
    const n = numero(m[1]);
    const objeto = m[2].replace(/^pe[çc]as?\b/i, pecas(n));
    return `Pintar ${n ? `${n} ` : ""}${objeto}`;
  }
  // "Peças substituídas", "Peça trocada": sem quantidade.
  return trocada && /^pe[çc]as?$/i.test(l) ? (/s$/i.test(l) ? "Pintar peças" : "Pintar 1 peça") : null;
}

// ── 10. Feito x a fazer ────────────────────────────────────────────────────
// "Polido" ja foi feito; "Polir" e "Polimento" sao coisa A FAZER. So mexe na
// linha que fala apenas disso -- "Polimento no capô" fica como o vendedor disse.
const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function polimento(l: string): string[] | null {
  const x = semAcento(l).toLowerCase();
  if (!/\b(poli|higieniz)/.test(x) || NEGADO.test(l)) return null;
  const sobra = x
    .replace(/\b(recem|polid[oa]s?|polimento|polir|higienizad[oa]s?|higienizacao|higienizar|feit[oa]s?|recentes?|nov[oa]|em dia|so|somente|apenas|precisa|de|fazer|faz|uma?|e|carro|veiculo|geral|completo)\b/g, "")
    .replace(/[\s,.+/&-]/g, "");
  if (sobra) return null;
  const polido = /\b(polid[oa]s?|polimento (feito|recente|novo|em dia))\b/.test(x);
  const higienizado = /\b(higienizad[oa]s?|higienizacao (feita|recente|em dia))\b/.test(x);
  const polir = !polido && /\b(polir|polimento)\b/.test(x);
  const higienizar = !higienizado && /\b(higienizar|higienizacao)\b/.test(x);
  const linhas: string[] = [];
  if (polido || higienizado) linhas.push(`Recém ${[polido && "polido", higienizado && "higienizado"].filter(Boolean).join(" e ")}`);
  if (polir || higienizar) linhas.push(`Fazer ${[polir && "polimento", higienizar && "higienização"].filter(Boolean).join(" e ")}`);
  return linhas.length ? linhas : null;
}

// ── 11. Tem um, nao tem o outro: duas linhas ───────────────────────────────
const ITEM = String.raw`(manual|chaves?(?:\s+(?:reserva|c[oó]pia))?)`;
const nomeDoItem = (s: string) => (/chave/i.test(s) ? "chave reserva" : "manual");

function temENaoTem(l: string): string[] | null {
  const LIGA = String.raw`\s*(?:,|;|\+|\/|-|\be\b|\bmas\b)?\s*`;
  let m = new RegExp(`^${ITEM}${LIGA}(?:sem|n[ãa]o\\s+tem)\\s+(?:a\\s+|o\\s+)?${ITEM}$`, "i").exec(l);
  if (m) return [`Tem ${nomeDoItem(m[1])}`, `Não tem ${nomeDoItem(m[2])}`];
  m = new RegExp(`^(?:sem|n[ãa]o\\s+tem)\\s+(?:a\\s+|o\\s+)?${ITEM}${LIGA}(?:com|tem)\\s+(?:a\\s+|o\\s+)?${ITEM}$`, "i").exec(l);
  return m ? [`Tem ${nomeDoItem(m[2])}`, `Não tem ${nomeDoItem(m[1])}`] : null;
}

// ── 5. Nada para fazer ─────────────────────────────────────────────────────
export const NADA_PARA_FAZER = "Nada para fazer";
const DIZ_NADA_PARA_FAZER =
  /^(?:carro\s+|ve[ií]culo\s+)?(?:(?:sem\s+)?nada\s+(?:para|pra|pa|a)\s+fazer|n[ãa]o\s+faz\s+nada|n[ãa]o\s+(?:tem|precisa)(?:\s+de)?\s+nada(?:\s+(?:para|pra|a)\s+fazer)?|pront[oa](?:\s+(?:para|pra|p\/)\s+(?:a\s+)?(?:venda|vender|loja|revenda|anunciar))?|n[ãa]o\s+gasta\s+nada|(?:sem|zero)\s+(?:custos?|gastos?))$/i;

/**
 * Uma linha do vendedor no padrao. Devolve mais de uma quando a linha mistura
 * o que o carro tem com o que nao tem (regra 11). `canonica` avisa que a linha
 * caiu numa traducao fechada -- ali a palavra da IA nao entra.
 */
export function padronizar(bruta: string): { linhas: string[]; canonica: boolean } {
  let l = bruta.replace(/^[\s*•·>\-–]+/, "").replace(/\s+/g, " ").trim();
  if (l.length > 3) l = l.replace(/[.;,!]+$/, "").trim();
  if (!l) return { linhas: [], canonica: false };
  const fechada = (linhas: string[]) => ({ linhas, canonica: true });

  if (DIZ_NADA_PARA_FAZER.test(l)) return fechada([NADA_PARA_FAZER]);
  const par = temENaoTem(l);
  if (par) return fechada(par);
  if (/^(carro\s+de\s+)?show\s*room$/i.test(l)) return fechada(["Carro de Showroom"]);
  // 14. "Dono desde os 10 mil km" -> "Comprou com 10.000km"
  const dono = /^(?:[úu]nico\s+)?dono\s+desde\s+(?:os?\s+)?(?:(\d{1,3})\s*mil|(0|zero))(?:\s*km)?$/i.exec(l);
  if (dono) return fechada([dono[1] ? `Comprou com ${dono[1]}.000km` : "Comprou 0km"]);

  l = okParaBom(glossario(frasear(l)));
  const servico = polimento(l);
  if (servico) return fechada(servico);
  const lataria = retocar(l) ?? pintar(l);
  return lataria ? fechada([lataria]) : { linhas: [l], canonica: false };
}

export const padronizarLinha = (bruta: string) => padronizar(bruta).linhas;

// ── O bloco de baixo: o que o carro precisa ────────────────────────────────
const VERBO_A_FAZER =
  /^(fazer|refazer|pintar|retocar|trocar|substituir|costurar|arrumar|consertar|reparar|recuperar|restaurar|polir|higienizar|lavar|limpar|alinhar|balancear|regularizar|colocar|instalar|repor|desamassar|soldar|revisar|precisa|necessita|falta|faltam|faltando)\b/i;
const AVARIA =
  /\b(polimento|higieniza[çc][ãa]o|amassad\w*|riscad\w*|riscos?|arranh\w*|batid[ao]s?|trincad\w*|trinca|rachad\w*|quebrad\w*|queimad\w*|estragad\w*|avaria\w*|defeito\w*|vazament\w*|vazando|barulh\w*|falhando|n[ãa]o\s+funciona\w*|luz\s+d[ea]\s+inje[çc][ãa]o|pneus?\s+(?:ruim|ruins|gast\w*|carec\w*)|ipva\s+(?:\d{2,4}\s+)?(?:a\s+pagar|atrasad\w*|vencid\w*|em\s+aberto|pendente)|multas?|d[ée]bitos?|gastos?\s+necess\w*|(?<!mais\s)detalhes?\s+(?:n[oa]s?|de|em)\s+(?!privado|pv|whats|contato)|martelinho|funilaria)\b/i;
// Falta de item e o unico "sem ..." que vai pro bloco de baixo.
const FALTA = /^(sem|n[ãa]o\s+tem|n[ãa]o\s+possui)\s+(a\s+|o\s+)?(manual|chave|estepe|step|macaco|nota|tapetes?)\b/i;

/** A linha (ja no padrao) e do bloco de baixo? "Sem retoques" e "Recém polido" sao elogio. */
export function eAFazer(l: string): boolean {
  if (l === NADA_PARA_FAZER || FALTA.test(l)) return true;
  if (NEGADO.test(l) || /^rec[eé]m\b/i.test(l)) return false;
  return VERBO_A_FAZER.test(l) || AVARIA.test(l);
}

// ── 5, 6, 7, 12, 14, 15. O que o vendedor escreveu e nao pode sumir ────────
const OBRIGATORIAS: RegExp[] = [
  /\bxbri\b/i,
  /\bpneus?\s+at\b/i,
  /^(bem\s+|muito\s+|super\s+)?nov[ao]s?(\s+de\s+andar)?$/i,
  /\bimpec[aá]ve(l|is)\b/i,
  /\brevisad[ao]s?\b/i,
  /\blind[oa]s?\s+(carro|ve[ií]culo|camioneta|caminhonete|picape|suv|sed[aã])/i,
  /\bshow\s*room\b/i,
  /^placa\b/i,
  /\b(n[ãa]o|nem)\s+(aparenta|parece\s+(a|ter|que))/i,
  /\bdono\s+desde\b|^comprou\s+(com|0)/i,
];
export const eObrigatoria = (l: string) => l === NADA_PARA_FAZER || OBRIGATORIAS.some((p) => p.test(l));

// ── 9. Dois blocos, organizados pela largura ───────────────────────────────
// Largura na tela, nao contagem de letra: "Vai com as rodas originais" e
// "Revisões na concessionária" tem 26 letras cada, e o cliente pos a primeira
// em cima -- e a mais estreita.
const ESTREITA = /[iIl.,;:'!|jtfr ]/;
const LARGA = /[mwMW@%]/;
export const largura = (s: string) =>
  [...s].reduce((t, c) => t + (LARGA.test(c) ? 1.5 : ESTREITA.test(c) ? 0.5 : /[A-ZÀ-Ú]/.test(c) ? 1.2 : 1), 0);

/**
 * O corpo em dois blocos: o que o carro tem de bom, do curto pro longo; uma
 * linha em branco; o que precisa ser feito, do longo pro curto.
 */
export function montarCorpo(linhas: string[]): string[] {
  const vistas = new Set<string>();
  const unicas = linhas.filter((l) => {
    const chave = semAcento(l).toLowerCase().replace(/\s+/g, " ").trim();
    if (!chave || vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
  // Empate de largura: ordem alfabetica, no mesmo sentido do bloco.
  const crescente = (a: string, b: string) => largura(a) - largura(b) || a.localeCompare(b, "pt-BR");
  const bom = unicas.filter((l) => !eAFazer(l)).sort(crescente);
  const aFazer = unicas.filter(eAFazer).sort((a, b) => crescente(b, a));
  return bom.length && aFazer.length ? [...bom, "", ...aFazer] : [...bom, ...aFazer];
}
