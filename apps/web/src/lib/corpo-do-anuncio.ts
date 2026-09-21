// ---------------------------------------------------------------------------
// O padrao do CORPO do anuncio.
//
// Sao as duas listas de regras do cliente -- 15 pontos em 18/09/2026 e 34 em
// 20/09/2026 -- em codigo. Ficam aqui, e nao so no prompt, por dois motivos:
// o anuncio tem que sair igual com ou sem IA (o caminho por regex usa as
// mesmas funcoes), e a IA ja provou que troca o sentido do que reescreve --
// "Polimento" virou "Polimento recente", "Faz 3 peças" virou "Motor com 3
// peças trocadas".
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
// "2/3 peças" e quantidade escrita pelo vendedor: sai do jeito que ele pos.
const N = String.raw`(\d+\s*/\s*\d+|\d+|uma?|dois|duas|tr[eê]s|quatro|cinco|seis)`;
const numero = (s?: string) => (s ? (/^\d+$/.test(s) ? Number(s) : NUMEROS[s.toLowerCase()]) : undefined);
/** A quantidade como vai pro texto, e se e plural. "2/3" fica "2/3". */
function quantia(bruta?: string): { texto: string; plural: boolean } {
  if (!bruta) return { texto: "", plural: true };
  if (bruta.includes("/")) return { texto: bruta.replace(/\s+/g, "") + " ", plural: true };
  const n = numero(bruta);
  return n ? { texto: `${n} `, plural: n !== 1 } : { texto: "", plural: true };
}
const plural = (p: boolean, singular: string, pl: string) => (p ? pl : singular);
const NEGADO = /^(sem|s\/|zero|nenhum[a]?|n[ãa]o\s+tem|n[ãa]o\s+possui|nunca)\b/i;
const semAcento = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
const maiuscula = (s: string) => s.replace(/^([^A-Za-zÀ-ú]*)([a-zà-ú])/, (_, a, c) => a + c.toUpperCase());

// ── 1 e 15 (lista 1), 11 (lista 2). Maiusculas ─────────────────────────────
// Sigla que fica inteira em maiusculas no corpo.
const SIGLAS = new Set([
  "IPVA", "ABS", "LED", "GPS", "AT", "MT", "TFT", "USB", "CVT", "DVD", "AWD", "ACC", "GNV",
  "CRLV", "DUT", "OK", "CSS", "RS", "SC", "PR", "SP", "MG", "RJ", "DF", "GO", "MS", "BA", "CE",
  "ADAS", "ATR", "HT", "AT3", "KO2",
]);
const LIGACAO = new Set(["DO", "DA", "DE", "NO", "NA", "EM", "E"]);
// Numeral romano fica em maiusculas ("casco nível III-A"). O padrao e estrito
// de proposito: "CIVIC" e "MIL" tambem so tem letras de romano.
const ROMANO = /^(?=[IVXLCDM]{1,6}$)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
const ehRomano = (bruto: string) => {
  const partes = bruto.split("-");
  return ROMANO.test(partes[0]) && partes.slice(1).every((x) => /^[A-Z0-9]{1,2}$/.test(x));
};
// Palavra curta e comum que, numa linha de pneu, NAO e modelo de pneu.
const NAO_E_MARCA = new Set(["BOM", "BOA", "BONS", "BOAS", "NOVO", "NOVA", "NOVOS", "RUIM", "MEIA", "VIDA", "ZERO", "AROS", "ARO"]);

function frasear(l: string): string {
  const letras = l.replace(/[^A-Za-zÀ-ú]/g, "");
  const todaMaiuscula = letras.length >= 2 && letras === letras.toUpperCase();
  const dePlaca = /^placa\b/i.test(l);
  // 10. Marca e modelo do pneu ficam como o vendedor escreveu.
  const dePneu = /\bpneu/i.test(l);
  const r = l
    .split(/(\s+)/)
    .map((p) => {
      const nu = p.replace(/[^A-Za-zÀ-ú0-9]/g, "");
      if (/^xbri$/i.test(nu)) return p.replace(/xbri/i, "XBri");
      if (nu.length < 2 || nu !== nu.toUpperCase() || !/[A-ZÀ-Ú]/.test(nu)) return p;
      if (/^4x[24]$/i.test(nu)) return p.toLowerCase();
      if (/\d/.test(nu) || SIGLAS.has(nu)) return p; // "V6", "T270", "IPVA"
      if (ehRomano(p.replace(/[^A-Za-z0-9-]/g, ""))) return p; // "III-A"
      // "Placa PE", "Placa J do RS": letra e estado da placa ficam.
      if (dePlaca && nu.length <= 2 && !LIGACAO.has(nu)) return p;
      if (dePneu && nu.length <= 4 && !LIGACAO.has(nu) && !NAO_E_MARCA.has(nu)) return p;
      // Sigla desconhecida numa linha escrita normal fica ("Pneus BF").
      if (!todaMaiuscula && nu.length <= 3) return p;
      return p.toLowerCase();
    })
    .join("");
  return maiuscula(r);
}

// ── Glossario do repasse ───────────────────────────────────────────────────
function glossario(l: string): string {
  let r = l
    .replace(/\bcss\b/gi, "concessionária")
    .replace(/\bchave\s+c[oó]pia\b/gi, "chave reserva")
    // 5. "Mala elétrica" -> "Porta-malas elétrico"
    .replace(/\bmalas?\s+(el[ée]tricas?|autom[áa]ticas?)\b/gi, "porta-malas elétrico")
    // 9. Teto-solar com hifen, sempre.
    .replace(/\btetos?\s+solar(es)?\b/gi, "teto-solar")
    // 11. ADAS e sigla.
    .replace(/\badas\b/gi, "ADAS")
    // 30. "Bancos de couro" -> "Bancos em couro"
    .replace(/\bbancos?\s+de\s+couro\b/gi, "bancos em couro")
    // 34. "Trato de loja" -> "Bem cuidado"
    .replace(/\btrato\s+de\s+loja\b/gi, "bem cuidado");
  // "IPVA 2026 PAGO" -> "IPVA 26 pago", como o cliente escreve.
  if (!/\b(n[ãa]o|a\s+pagar|atrasad|vencid|abert|pendente|falta)/i.test(r)) {
    r = r.replace(
      /\bipva\s*(?:de\s*)?(?:20)?(\d{2})?\s*:?\s*(?:total\s*)?(?:pago|pg|quitad[oa]|ok)\b(?:\s*(?:20)?(\d{2})\b)?/i,
      (_, antes, depois) => `IPVA ${antes ?? depois ? `${antes ?? depois} ` : ""}pago`
    );
  }
  return maiuscula(r);
}

// ── 2 e 14. Diminutivo ─────────────────────────────────────────────────────
// Defeito no diminutivo vira "Pequeno X" (regra 14); o resto so perde o
// diminutivo (regra 2): "Bem novinha" -> "Bem nova".
const DEFEITO_PEQUENO: [RegExp, string][] = [
  [/\bamassadinh[oa]s?\b/gi, "pequeno amassado"],
  [/\barranh[ãa]ozinhos?\b/gi, "pequeno arranhão"],
  [/\bris(?:qu|coz)inhos?\b/gi, "pequeno risco"],
  [/\bdetalhezinhos?\b/gi, "pequeno detalhe"],
  [/\bbatidinhas?\b/gi, "pequena batida"],
  [/\bmarquinhas?\b/gi, "pequena marca"],
  [/\bmossinhas?\b/gi, "pequena mossa"],
  [/\bbolhinhas?\b/gi, "pequena bolha"],
];
const DIMINUTIVO: [RegExp, string][] = [
  [/\bnovinh([oa]s?)\b/gi, "nov$1"],
  [/\binteirinh([oa]s?)\b/gi, "inteir$1"],
  [/\bbonitinh([oa]s?)\b/gi, "bonit$1"],
  [/\bcertinh([oa]s?)\b/gi, "cert$1"],
  [/\blimpinh([oa]s?)\b/gi, "limp$1"],
  [/\bcarrinh(os?)\b/gi, "carr$1"],
  // Geral: base grande o bastante pra nao pegar "caminho", "vizinho", "vinho".
  [/\b([a-zà-ú]{4,})zinh[oa]s?\b/gi, "$1"],
  [/\b([a-zà-ú]{4,})inh([oa])(s?)\b/gi, "$1$2$3"],
];

function semDiminutivo(l: string): string {
  let r = l;
  for (const [de, para] of DEFEITO_PEQUENO) r = r.replace(de, para);
  for (const [de, para] of DIMINUTIVO) r = r.replace(de, para);
  return maiuscula(r);
}

// ── 18. "Carro" -> "Veiculo" ───────────────────────────────────────────────
const carroParaVeiculo = (l: string) =>
  maiuscula(l.replace(/\bcarros\b/gi, "veículos").replace(/\bcarro\b/gi, "veículo"));

// ── 3 (lista 1). "OK" e informal: bom, boa, bons, boas ─────────────────────
const FEMININO =
  /^(caixa|lataria|pintura|mec[aâ]nica|el[eé]trica|bateria|estrutura|tape[çc]aria|funilaria|parte|carroceria|correia|bomba|turbina|capota|ca[çc]amba|multim[ií]dia|embreagem|suspens[ãa]o|dire[çc][ãa]o)s?$|([çs][ãa]o|gem|dade)$/i;

/** "bom/boa/bons/boas" de acordo com o sujeito. */
function concordar(sujeito: string): string {
  const nucleos = sujeito.split(/\s*(?:,|\+|\/|\be\b)\s*/i).map((i) => i.trim().split(/\s+/)[0]).filter(Boolean);
  const feminino = nucleos.length > 0 && nucleos.every((p) => FEMININO.test(p));
  const pl = nucleos.length > 1 || /s$/i.test(nucleos[0] ?? "");
  return feminino ? (pl ? "boas" : "boa") : pl ? "bons" : "bom";
}

function okParaBom(l: string): string {
  const m = /^(.*?\S)\s*[:\-–]?\s*\b(?:est[áa]o?\s+|t[áa]\s+)?ok\b(.*)$/i.exec(l);
  if (!m) return l;
  const sujeito = m[1].replace(/\s+(tudo|td|100\s*%)$/i, "").trim();
  if (!/[a-zà-ú]{3}/i.test(sujeito) || /^(tudo|td)$/i.test(sujeito)) return l;
  return `${sujeito} ${concordar(sujeito)}${m[2]}`;
}

// ── 28. "Boa de pneus" -> "Pneus bons" ─────────────────────────────────────
const DE_ANDAR = /^(andar|rodar|correr|pegar|arrancar|acelerar|freiar|frear)$/i;

function boaDe(l: string): string | null {
  const m = /^(bo[ma]s?|boas|[óo]tim[oa]s?|excelentes?)\s+de\s+(.+)$/i.exec(l);
  if (!m || DE_ANDAR.test(m[2].trim())) return null;
  const sujeito = maiuscula(m[2].trim());
  return `${sujeito} ${concordar(m[2].trim())}`;
}

// ── 23 e 27. Pintar x retocar ──────────────────────────────────────────────
// Quantidade de pecas (inclusive "gasta") e PINTAR. Falou em retoque, e
// "Fazer N retoques" -- a peca nao precisa de pintura inteira.
const PECA = String.raw`(?:pe[çc]as?|pcs?|p[çc]s?)`;
const PARTE = String.raw`(?:${PECA}|para-?\s?choques?|parachoques?|cap[ôo]s?|portas?|para-?lamas?|tetos?|tampas?|laterais|lateral|colunas?|saias?|retrovisor(?:es)?|porta-?malas)`;
// "pç" acaba em caractere que o \b do JS nao conta como letra: o limite da
// palavra aqui tem que olhar a proxima letra, senao "Gasta 1 pç" nao casa.
const FIM = String.raw`(?![a-zà-ú])`;
const TROCA = /\b(?:substitu[ií]d[ao]s?|substitui[çc][ãa]o|substituir|trocad[ao]s?|trocar?)(?:\s+d[ea]s?)?\b/i;
const QUANTIDADE = new RegExp(`\\b${N}\\b`, "i");

/** 27. Retoque pendente, do jeito que o cliente pediu: "Fazer 2 retoques". */
function retocar(l: string): string | null {
  if (NEGADO.test(l) || !/\b(retoques?|retoc\w+|refor[çc]\w+|pinc[eé](?:l|is)|pinceis)\b/i.test(l)) return null;
  // 25. "Faz 2 pincel" -> "Fazer 2 pincéis"
  const pincel = /\bpinc[eé](?:l|is)\b|\bpinceis\b/i.test(l);
  const q = quantia(QUANTIDADE.exec(l)?.[1]);
  if (!q.texto) {
    // Sem quantidade: parte nomeada fica ("Retoque no para-choque").
    const onde = /^(?:faz(?:er)?\s+)?(?:retoques?|retocar)\s+((?:em|n[oa]s?|d[oa]s?)\s+.+)$/i.exec(l);
    if (onde) return `Fazer retoque ${onde[1]}`;
    const pl = /\b(retoques|pinc[eé]is|pinceis)\b/i.test(l);
    return `Fazer ${pl ? "" : "1 "}${pincel ? plural(pl, "pincel", "pincéis") : plural(pl, "retoque", "retoques")}`;
  }
  return `Fazer ${q.texto}${pincel ? plural(q.plural, "pincel", "pincéis") : plural(q.plural, "retoque", "retoques")}`;
}

function pintar(bruta: string): string | null {
  if (/\bsem\s+pe[çc]/i.test(bruta)) return null;
  // "Uma peça substituída", "Substituição de duas peças", "Precisa trocar 1 peça":
  // no repasse, peca e peca pintada -- nunca "substituída".
  const trocada = TROCA.test(bruta) && /pe[çc]as?/i.test(bruta) && !/\bpint/i.test(bruta);
  const l = trocada ? bruta.replace(TROCA, " ").replace(/\s+/g, " ").trim() : bruta;
  // 23. "Gasta 2 peças", "Faz 2 pç", "Refazer 2 peças", "Pinta 4 peças"
  let m = new RegExp(
    `^(?:faz|fazer|refaz|refazer|pint[ao]|pintar|gast[ao]|gastar|precisa(?:\\s+de)?(?:\\s+pintar)?)\\s+(?:${N}\\s*x?\\s+)?(${PARTE}${FIM}.*)$`,
    "i"
  ).exec(l);
  // "2x peças", "1x Peças", "3 peças e pneus bons"
  m ??= new RegExp(`^${N}\\s*x?\\s*(${PECA}${FIM}.*)$`, "i").exec(l);
  if (m) {
    const q = quantia(m[1]);
    const objeto = m[2].replace(new RegExp(`^${PECA}${FIM}`, "i"), plural(q.plural, "peça", "peças"));
    return `Pintar ${q.texto}${objeto}`;
  }
  // "Peças substituídas", "Peça trocada": sem quantidade.
  return trocada && new RegExp(`^${PECA}$`, "i").test(l) ? (/s$/i.test(l) ? "Pintar peças" : "Pintar 1 peça") : null;
}

// ── 32. Pneu pra trocar e pneu ruim ────────────────────────────────────────
// Com quantidade na frente a linha ja comeca por numero: "1 pneu ruim".
const comQuantia = (q: { texto: string }, resto: string) =>
  q.texto ? `${q.texto}${resto}` : maiuscula(resto);
function pneuRuim(l: string): string | null {
  let m = new RegExp(`^(?:trocar?|substituir|precisa(?:\\s+de)?|tem\\s+que\\s+trocar)\\s+(?:${N}\\s+)?pneus?\\b\\s*$`, "i").exec(l);
  if (m) {
    const q = quantia(m[1]);
    return comQuantia(q, plural(q.plural, "pneu ruim", "pneus ruins"));
  }
  m = new RegExp(`^${N}?\\s*pneus?\\s+(?:fracos?|fraca?s?|gast[oa]s?|carecas?|ruins?|ruim|velh[oa]s?|vencid[oa]s?|lisos?|no\\s+fim)\\s*$`, "i").exec(l);
  if (!m) return null;
  const q = quantia(m[1]);
  return comQuantia(q, plural(q.plural || !m[1], "pneu ruim", "pneus ruins"));
}

// ── 10 (lista 1). Feito x a fazer ──────────────────────────────────────────
// "Polido" ja foi feito; "Polir" e "Polimento" sao coisa A FAZER. So mexe na
// linha que fala apenas disso -- "Polimento no capô" fica como o vendedor disse.
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

// ── 3. Manual e chave reserva: "Com" quando tem, "Sem" quando nao tem ──────
const ITEM_DOC =
  /(sem|s\/|n[ãa]o\s+tem|n[ãa]o\s+possui|n[ãa]o|com|tem|possui|acompanha)?\s*\b(manuais?|manual(?:\s+do\s+propriet[áa]rio)?|chaves?(?:\s+(?:reserva|c[oó]pia|extra))?)\b(?:\s*(ok|sim|n[ãa]o|s\/)(?!\s+(?:tem|possui)\b))?/gi;
const nomeDoItem = (s: string) => (/chave/i.test(s) ? "chave reserva" : "manual");

/**
 * A linha que fala de manual e/ou chave reserva. Os dois na mesma situacao
 * ficam juntos ("Com manual e chave reserva"); situacoes diferentes viram
 * duas linhas ("Com manual" / "Sem chave reserva").
 */
function manualEChave(l: string): string[] | null {
  const achados: { item: string; tem: boolean }[] = [];
  let tem = true;
  for (const m of l.matchAll(ITEM_DOC)) {
    const marca = `${m[1] ?? ""} ${m[3] ?? ""}`.trim();
    // Sem marcacao propria, herda a anterior: "sem manual e chave" nega os dois.
    if (marca) tem = !/^(sem|s\/|n[ãa]o)/i.test(marca);
    const item = nomeDoItem(m[2]);
    if (!achados.some((a) => a.item === item)) achados.push({ item, tem });
  }
  if (!achados.length) return null;
  // Uma linha que so cita "Manual", sem verbo, pode ser o cambio: nao mexe.
  if (achados.length === 1 && achados[0].item === "manual" && !/\b(sem|s\/|n[ãa]o|com|tem|possui|acompanha|propriet[áa]rio)\b/i.test(l)) return null;
  // Sobrou texto de outra informacao na linha? Deixa como o vendedor escreveu.
  const sobra = l.replace(ITEM_DOC, "").replace(/[\s,;/+\-]|(\be\b)|(\bmas\b)/gi, "");
  if (sobra) return null;
  if (achados.length === 2 && achados[0].tem === achados[1].tem) {
    return [`${achados[0].tem ? "Com" : "Sem"} manual e chave reserva`];
  }
  return achados.map((a) => `${a.tem ? "Com" : "Sem"} ${a.item}`);
}

// ── 4. Interna, externa, interior ──────────────────────────────────────────
const INTENSO = /^(zer[oa]d?[oa]?|zera|nov[oa]s?|impec[áa]ve(?:l|is)|perfeit[oa]s?|show|top|imaculad[oa]s?)$/i;
const CONSERVADO = /^(bonit[oa]s?|lind[oa]s?|bem\s+conservad[oa]s?|conservad[oa]s?|bem\s+cuidad[oa]s?)$/i;

function internoExterno(l: string): string | null {
  if (!/\b(interior(?:es)?|intern[oa]s?|extern[oa]s?)\b/i.test(l)) return null;
  const r = l
    .replace(/\binterior(?:es)?\b/gi, "interno")
    .replace(/\bintern[oa]s?\b/gi, "interno")
    .replace(/\bextern[oa]s?\b/gi, "externo")
    // Concordancia depois de virar masculino: "bem conservadas" -> "conservados".
    .replace(/\b(conservad|cuidad|limp|nov|bonit|zerad|perfeit|inteir|origin)a(s?)\b/gi, "$1o$2")
    .replace(/\s+/g, " ")
    .trim();
  const so = /^interno\s+(.+)$/i.exec(r);
  if (so) {
    const resto = so[1].trim();
    if (INTENSO.test(resto)) return "Interno impecável";
    if (CONSERVADO.test(resto)) return "Interno bem conservado";
  }
  return maiuscula(r);
}

// ── 13, 15, 16, 17. Elogio e carro pronto ──────────────────────────────────
export const NADA_PARA_FAZER = "Nada para fazer";
export const PRONTO_PARA_VENDA = "Veículo pronto para venda";
export const ACIMA_DA_MEDIA = "Veículo conservado acima da média";

// 13 e 15. "Filé", "filezão", "bem pronto", elogio solto -> acima da media.
const DIZ_ACIMA_DA_MEDIA =
  /^(?:(?:o\s+)?(?:carro|ve[ií]culo)\s+)?(?:t[áa]\s+|est[áa]\s+|)(?:muito\s+|bem\s+|super\s+|bastante\s+|pronto\s+)?(?:fil[ée]z[ãa]o|fil[ée]zinho|fil[ée]|file|filezao|bem\s+pront[oa]|inteir[ãa]o|inteir[oa]|bonit[oa]|lind[oa])(?:\s+(?:carro|ve[ií]culo|camioneta|caminhonete|picape|suv|sed[aã]|de\s+mais|demais))?$/i;
// 16. "Pronta", "Pronto só vender": nada relevante a fazer.
const DIZ_PRONTO =
  /^(?:(?:o\s+)?(?:carro|ve[ií]culo)\s+)?pront[oa](?:\s*[,/-]?\s*(?:s[óo]\s+|apenas\s+)?(?:vender|venda|para\s+(?:a\s+)?(?:venda|vender|loja|revenda|anunciar)|pra\s+(?:venda|vender)|p\/\s*(?:venda|vender)))?$/i;
// 5 (lista 1). Nada para fazer.
const DIZ_NADA_PARA_FAZER =
  /^(?:carro\s+|ve[ií]culo\s+)?(?:(?:sem\s+)?nada\s+(?:para|pra|pa|a)\s+fazer|n[ãa]o\s+faz\s+nada|n[ãa]o\s+(?:tem|precisa)(?:\s+de)?\s+nada(?:\s+(?:para|pra|a)\s+fazer)?|n[ãa]o\s+gasta\s+nada|(?:sem|zero)\s+(?:custos?|gastos?))$/i;
// 17. Elogio ao estado, no formal.
const DIZ_EXCELENTE_ESTADO =
  /^(?:(?:o\s+)?(?:carro|ve[ií]culo)\s+)?(?:em\s+|est[áa]\s+em\s+)?(excelente|[óo]timo|[óo]tima|[óo]tim[oa]s?|bom|boa)\s+estado(?:\s+de\s+conserva[çc][ãa]o)?$/i;

// ── 20 e 33. Titulo de bloco, que nao entra no anuncio ─────────────────────
const TITULO_DE_BLOCO =
  /^(?:gastos?\s+(?:necess[áa]ri[oa]s?|previstos?)|o\s+que\s+(?:tem\s+)?(?:para\s+|pra\s+)?fazer|(?:para|pra)\s+fazer|a\s+fazer|afazeres|detalhes?\s+(?:para|pra)\s+fazer|custos?|servi[çc]os?\s+(?:necess[áa]ri[oa]s?|pendentes?)|observa[çc][õo]es|observa[çc][ãa]o|obs\.?|defeitos?|avarias?|repar[oa]s?|itens?\s+a\s+fazer|detalhes?|pend[êe]ncias?)\s*:?\s*$/i;
// "Detalhes: nenhum" -- o rotulo diz que nao ha nada, e nada entra.
const CONTEUDO_VAZIO = /^(nenhum[a]?|nada|n[ãa]o|sem|zero|ok|n\/?a|-+)$/i;

// ── 1, 31 e 35. Linha que nao entra no anuncio ─────────────────────────────
const DESCARTAR: RegExp[] = [
  // 1. Leilao e sinistro so aparecem quando EXISTEM.
  /^(?:carro\s+|ve[ií]culo\s+)?(?:sem|s\/|n[ãa]o\s+(?:tem|possui)|nunca\s+(?:teve|passou\s+(?:por|em)))\s+(?:passagem\s+(?:por|em|de)\s+)?(?:leil[ãa]o|sinistr\w*|batida\s+forte|monta|recupera\w*|indeniza\w*)\b/i,
  /^(?:leil[ãa]o|sinistr\w*|monta)\s*:?\s*(?:n[ãa]o|nunca|zero|nenhum[a]?|sem|limpo)\b/i,
  // 35. Ar-condicionado funcionando nao e informacao de anuncio.
  /^ar(?:\s*-?\s*condicionad[oa])?\s*[:,-]?\s*(?:gelando|gela|gelad[oa]|funcionando|funciona|ok|em\s+dia|top|perfeito|[óo]tim[oa]|bom|novo|100\s*%?)\s*$/i,
];
// 31. Opcional basico, que o cliente nao quer ver listado.
const OPCIONAL_BASICO =
  /^(?:rodas?\s+(?:de\s+)?liga(?:\s+leve)?|rodas?\s+esportivas?|rodas?\s+de\s+f[áa]brica|airbags?(?:\s+(?:duplos?|frontais?|laterais?|\d+))?|freios?\s+abs|abs|far[oó](?:l|is)\s+de\s+milha|milha)$/i;
const soOpcionalBasico = (l: string) => {
  const partes = l.split(/\s*(?:,|;|\+|\/|\be\b)\s*/i).map((p) => p.trim()).filter(Boolean);
  return partes.length > 0 && partes.every((p) => OPCIONAL_BASICO.test(p));
};

// ── 28. Duas informacoes na mesma linha ────────────────────────────────────
// So separa quando o vendedor repetiu o adjetivo ("boa de andar E BOA de
// pneus"). "Manual e chave reserva" e "Motor, caixa e suspensão OK" ficam.
const SEPARAVEL = /\s+e\s+(?=(?:bo[ma]s?|boas|ruins?|ruim|[óo]tim[oa]s?|excelentes?|nov[oa]s?|impec[áa]ve(?:l|is))\s+de\s+)/i;

/**
 * Uma linha do vendedor no padrao. Devolve mais de uma quando a linha mistura
 * duas informacoes (regras 3 e 28). `canonica` avisa que a linha caiu numa
 * traducao fechada -- ali a palavra da IA nao entra.
 */
export function padronizar(bruta: string): { linhas: string[]; canonica: boolean } {
  let l = bruta.replace(/^[\s*•·>\-–]+/, "").replace(/\s+/g, " ").trim();
  if (l.length > 3) l = l.replace(/[.;,!]+$/, "").trim();
  if (!l) return { linhas: [], canonica: false };
  const fechada = (linhas: string[]) => ({ linhas, canonica: true });

  // 20 e 33. "Gastos necessários:", "Obs.:" -- o titulo sai, o que vem
  // escrito depois dele na mesma linha fica.
  const titulo = /^([^:]{2,30}):\s*(.+)$/.exec(l);
  if (titulo && TITULO_DE_BLOCO.test(`${titulo[1]}:`)) {
    return fechada(CONTEUDO_VAZIO.test(titulo[2].trim()) ? [] : padronizar(titulo[2]).linhas);
  }
  if (TITULO_DE_BLOCO.test(l)) return fechada([]);

  // 28. "Boa de andar e boa de pneus" -> duas linhas.
  if (SEPARAVEL.test(l)) return fechada(l.split(SEPARAVEL).flatMap((p) => padronizar(p).linhas));

  if (DESCARTAR.some((p) => p.test(l)) || soOpcionalBasico(l)) return fechada([]);

  l = carroParaVeiculo(semDiminutivo(glossario(frasear(l))));

  // 13, 15, 16, 17 e 5 (lista 1): as frases fechadas.
  if (DIZ_ACIMA_DA_MEDIA.test(l)) return fechada([ACIMA_DA_MEDIA]);
  if (DIZ_NADA_PARA_FAZER.test(l)) return fechada([NADA_PARA_FAZER]);
  if (DIZ_PRONTO.test(l)) return fechada([PRONTO_PARA_VENDA]);
  const estado = DIZ_EXCELENTE_ESTADO.exec(l);
  if (estado) return fechada([`Veículo em ${/bo[ma]/i.test(estado[1]) ? "bom" : "excelente"} estado`]);
  if (/^(?:ve[ií]culo\s+de\s+)?show\s*room$/i.test(l)) return fechada(["Veículo de Showroom"]);
  // 14 (lista 1). "Dono desde os 10 mil km" -> "Comprou com 10.000km"
  const dono = /^(?:[úu]nico\s+)?dono\s+desde\s+(?:os?\s+)?(?:(\d{1,3})\s*mil|(0|zero))(?:\s*km)?$/i.exec(l);
  if (dono) return fechada([dono[1] ? `Comprou com ${dono[1]}.000km` : "Comprou 0km"]);

  const documentos = manualEChave(l);
  if (documentos) return fechada(documentos);
  const dentroEFora = internoExterno(l);
  // So a leitura de intensidade fecha a traducao; "Interna couro" vira
  // "Interno couro" mas aceita o "Interno em couro" da IA por cima.
  if (dentroEFora) {
    return /^Interno (impec[áa]vel|bem conservado)$/.test(dentroEFora)
      ? fechada([dentroEFora])
      : { linhas: [dentroEFora], canonica: false };
  }

  l = okParaBom(l);
  const servico = polimento(l);
  if (servico) return fechada(servico);
  // "2 peças e retoque": dois servicos numa linha. Inteira, ela caia no
  // retoque com o numero das pecas -- "Fazer 2 retoques", pintura sumida. So
  // separa quando cada parte, sozinha, e traducao fechada do bloco de baixo;
  // "Motor, caixa e suspensão OK" fica inteira.
  const partes = l.split(/\s*(?:,|;|\+|\be\b)\s*/i).filter(Boolean);
  if (partes.length > 1) {
    const cada = partes.map(padronizar);
    if (cada.every((p) => p.canonica && p.linhas.length > 0 && p.linhas.every(eAFazer))) {
      return fechada(cada.flatMap((p) => p.linhas));
    }
  }
  const lataria = retocar(l) ?? pintar(l) ?? pneuRuim(l) ?? boaDe(l);
  if (lataria) return fechada([lataria]);
  // 21. "Só lavar" -> "Apenas lavar"
  l = l.replace(/^s[óo]\s+(?=[a-zà-ú])/i, "Apenas ");
  return { linhas: [maiuscula(l)], canonica: false };
}

export const padronizarLinha = (bruta: string) => padronizar(bruta).linhas;

// ── O bloco de baixo: o que o carro precisa ────────────────────────────────
const VERBO_A_FAZER =
  /^(?:apenas\s+|s[óo]\s+)?(fazer|refazer|pintar|retocar|trocar|substituir|costurar|arrumar|consertar|reparar|recuperar|restaurar|polir|higienizar|lavar|limpar|alinhar|balancear|regularizar|colocar|instalar|repor|desamassar|soldar|revisar|precisa|necessita|falta|faltam|faltando)\b/i;
const AVARIA =
  /\b(polimento|higieniza[çc][ãa]o|amassad\w*|riscad\w*|riscos?|arranh\w*|batid[ao]s?|trincad\w*|trinca|rachad\w*|quebrad\w*|queimad\w*|estragad\w*|avaria\w*|defeito\w*|vazament\w*|vazando|barulh\w*|falhando|n[ãa]o\s+funciona\w*|luz\s+d[ea]\s+inje[çc][ãa]o|pneus?\s+(?:ruim|ruins|gast\w*|carec\w*|fracos?)|ipva\s+(?:\d{2,4}\s+)?(?:a\s+pagar|atrasad\w*|vencid\w*|em\s+aberto|pendente)|multas?|d[ée]bitos?|gastos?\s+necess\w*|(?<!mais\s)detalhes?\s+(?:n[oa]s?|de|em)\s+(?!privado|pv|whats|contato)|ralad\w*|martelinho|funilaria|retoques?|pinc[eé](?:l|is)|pinceis|leil[ãa]o|sinistr\w*|(?:m[ée]dia|pequena|grande)\s+monta|recuperad[ao]s?)\b/i;
// 26. "RS" do repasse e recuperado de sinistro -- mas "Placa J do RS" e estado.
const SO_RS = /^(?:tem\s+|com\s+|)rs(?:\s+no\s+documento)?$/i;
// Falta de item e o unico "sem ..." que vai pro bloco de baixo.
const FALTA = /^(sem|n[ãa]o\s+tem|n[ãa]o\s+possui)\s+(a\s+|o\s+)?(manual|chave|estepe|step|macaco|nota|tapetes?)\b/i;

/** A linha (ja no padrao) e do bloco de baixo? "Sem retoques" e "Recém polido" sao elogio. */
export function eAFazer(l: string): boolean {
  if (l === NADA_PARA_FAZER || FALTA.test(l) || SO_RS.test(l)) return true;
  if (l === PRONTO_PARA_VENDA || l === ACIMA_DA_MEDIA) return false;
  if (NEGADO.test(l) || /^rec[eé]m\b/i.test(l)) return false;
  return VERBO_A_FAZER.test(l) || AVARIA.test(l);
}

// ── O que o vendedor escreveu e nao pode sumir ─────────────────────────────
const OBRIGATORIAS: RegExp[] = [
  /\bxbri\b/i,
  /\bpneus?\s+at\b/i,
  /^(bem\s+|muito\s+|super\s+)?nov[ao]s?(\s+de\s+andar)?$/i,
  /\bimpec[aá]ve(l|is)\b/i,
  /\brevisad[ao]s?\b/i,
  /\bshow\s*room\b/i,
  /^placa\b/i,
  /\b(n[ãa]o|nem)\s+(aparenta|parece\s+(a|ter|que))/i,
  /\bdono\s+desde\b|^comprou\s+(com|0)/i,
  /\bconservado\s+acima\s+da\s+m[ée]dia\b/i,
  /^ve[ií]culo\s+(pronto\s+para\s+venda|em\s+(bom|excelente)\s+estado|[íi]ntegro)$/i,
  /\bleil[ãa]o\b|\bsinistr/i,
];
export const eObrigatoria = (l: string) => l === NADA_PARA_FAZER || OBRIGATORIAS.some((p) => p.test(l));

// ── 24. Sem informacao repetida ────────────────────────────────────────────
// Repetida nao e so a linha igual: "Teto solar" e "Teto-solar", "Pneus bons"
// e "Bons pneus" sao a mesma coisa. Numero entra na chave, senao "Pintar 2
// peças" e "Pintar 3 peças" viravam uma so.
const SEM_PESO = new Set([
  "para", "pra", "uma", "uns", "dos", "das", "que", "seu", "sua", "este", "esta", "esse", "essa",
  "sao", "estao", "muito", "bem", "super", "bastante", "todo", "toda", "esta", "mais",
]);
const chaveSemantica = (l: string) => {
  const x = semAcento(l).toLowerCase();
  const numeros = (x.match(/\d+/g) ?? []).join(",");
  const palavras = (x.match(/[a-z]{3,}/g) ?? []).filter((w) => !SEM_PESO.has(w)).map((w) => w.slice(0, 4));
  return `${numeros}|${[...new Set(palavras)].sort().join(" ")}`;
};

// ── 9 (lista 1). Dois blocos, organizados pela largura ─────────────────────
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
  // Entre duas linhas que dizem a mesma coisa, fica a que diz mais.
  const porChave = new Map<string, string>();
  for (const l of linhas) {
    if (!l.trim()) continue;
    const chave = chaveSemantica(l);
    const atual = porChave.get(chave);
    if (!atual || largura(l) > largura(atual)) porChave.set(chave, l);
  }
  const unicas = [...porChave.values()];
  // Empate de largura: ordem alfabetica, no mesmo sentido do bloco.
  const crescente = (a: string, b: string) => largura(a) - largura(b) || a.localeCompare(b, "pt-BR");
  const bom = unicas.filter((l) => !eAFazer(l)).sort(crescente);
  const aFazer = unicas.filter(eAFazer).sort((a, b) => crescente(b, a));
  return bom.length && aFazer.length ? [...bom, "", ...aFazer] : [...bom, ...aFazer];
}
