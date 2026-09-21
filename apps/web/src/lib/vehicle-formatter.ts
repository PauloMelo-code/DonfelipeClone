// ---------------------------------------------------------------------------
// Vehicle Ad Formatter
// ---------------------------------------------------------------------------
// THE MOST CRITICAL FILE for business rules.
//
// Implements the hybrid rule, profit margin calculation, and the
// standardised output template used across all WhatsApp TARGET groups.
// ---------------------------------------------------------------------------

import { montarCorpo, padronizarLinha } from "./corpo-do-anuncio";
import { COMBUSTIVEL_ESCRITO, combustivelConfirmado } from "./ai/cambio";

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
 * O km do anuncio, arredondado pro milhar mais proximo: 27.946 -> "28.000",
 * 27.400 -> "27.000". Escolha do cliente (18/09/2026), ciente de que pode sair
 * menor que o real. So no texto do anuncio -- o banco e a tela guardam o km
 * exato. Abaixo de mil fica como veio: 400 km nao e carro "0km".
 */
function kmFormatted(km: number): string {
  return (km < 1000 ? km : Math.round(km / 1000) * 1000).toLocaleString("pt-BR");
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
    return "(híbrido)";
  }

  switch (transmission) {
    case "AUTOMATICO":
      return "(aut.)";
    // 12. O cliente escreve "(mec.)" -- nunca "(manual)".
    case "MANUAL":
      return "(mec.)";
    case "CVT":
      return "(CVT)";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Titulo no padrao Don Felipe
//
// "E-Tron Sportback Performance Black (aut.)": modelo e versao, sem marca,
// sem ano (vem na linha de baixo), sem combustivel, turbo colado na
// motorizacao ("1.6T") e o cambio so no fim, entre parenteses.
//
// Palavra comum so com a inicial maiuscula ("Longitude", "Highline"); sigla
// sempre inteira em maiusculas ("Hilux CD SRV", "GLI", "AMG"), como o cliente
// pediu. Sigla sem vogal ja sai sozinha; a que tem vogal precisa estar em
// SIGLAS -- achou uma saindo "Xli", e aqui que ela entra.
// ---------------------------------------------------------------------------

const MARCAS = [
  "MERCEDES-BENZ", "MERCEDES BENZ", "MERCEDES", "LAND ROVER", "RANGE ROVER", "CAOA CHERY", "CHERY",
  "VOLKSWAGEN", "VW", "CHEVROLET", "GM", "TOYOTA", "HONDA", "HYUNDAI", "FIAT", "FORD",
  "NISSAN", "JEEP", "MITSUBISHI", "KIA", "RENAULT", "PEUGEOT", "CITROEN", "CITROËN", "BMW",
  "AUDI", "VOLVO", "JAGUAR", "PORSCHE", "SUBARU", "SUZUKI", "BYD", "GWM", "RAM", "DODGE",
  "CHRYSLER", "MINI", "LEXUS", "INFINITI", "MASERATI", "TROLLER", "JAC", "SMART", "FERRARI",
  "LAMBORGHINI", "MCLAREN", "BENTLEY", "ROLLS-ROYCE", "ASTON MARTIN", "ALFA ROMEO",
  "TESLA", "GAC", "OMODA", "JAECOO", "ZEEKR",
];

const SIGLAS = new Set([
  "AMG", "GT", "GTI", "GTS", "GTE", "GLI", "GLS", "GLX", "GL", "GLE", "GLC", "GLA", "GLB",
  "CLA", "CLS", "SLK", "LT", "LTZ", "LS", "LX", "LXS", "EX", "EXL", "EXR", "EXS", "DX", "SX",
  "SE", "SEL", "SR", "SRV", "SRX", "SRT", "XE", "XEI", "XLS", "XRE", "XR", "XRX", "XS", "XL",
  "XLT", "XLE", "XSE", "LE", "RS", "RSI", "TSI", "TFSI", "TDI", "GDI", "AWD", "FWD", "HPE",
  "HSE", "SVR", "SV", "ST", "STI", "WRX", "SLT", "SXT", "TRD", "GR", "JCW", "CD", "CS",
  "CX", "DS", "SQ", "RR", "MHEV", "PHEV", "HEV", "EV", "CC", "TL", "LTD", "SUV", "SS",
  "SI", "RT", "TR", "ZX", "ABS",
  // Versoes e motores com vogal, que a regra do "sem vogal" nao pega.
  "CE", "XLI", "ELX", "MSI", "MPI", "TGDI", "CRDI", "HDI", "GSI", "SCE", "TCE", "ASX",
  "AMT", "BEV", "EQA", "EQB", "EQC", "EQE", "EQS", "ES", "IS", "UX", "RAM",
]);

/** Grafias de fabricante que nao seguem a regra geral. */
function grafiaPropria(pedaco: string): string | null {
  // BMW: "sDrive20i", "xDrive45e".
  const drive = /^([sx])drive(\d*)([ide]?)$/i.exec(pedaco);
  if (drive) return `${drive[1].toLowerCase()}Drive${drive[2]}${drive[3].toLowerCase()}`;
  // BMW/Mercedes/Fiat: "320i", "M340i", "220d", "500e" -- a letra do fim e minuscula.
  if (/^[a-z]?\d{2,3}[ide]$/i.test(pedaco)) return pedaco.slice(0, -1).toUpperCase() + pedaco.slice(-1).toLowerCase();
  if (/^ix$/i.test(pedaco)) return "iX";
  return null;
}

const MINUSCULAS = new Set(["de", "da", "do", "dos", "das", "e"]);

function caixaDoPedaco(pedaco: string): string {
  if (!pedaco) return pedaco;
  const propria = grafiaPropria(pedaco);
  if (propria) return propria;
  const maiusculo = pedaco.toUpperCase();
  // Codigo com numero: "A45", "2.0T", "T270", "4MATIC". O "i" da BMW fica.
  if (/\d/.test(pedaco)) {
    return /^i[a-z]?\d/i.test(pedaco) ? "i" + maiusculo.slice(1) : maiusculo;
  }
  if (pedaco.length === 1) return maiusculo;
  if (SIGLAS.has(maiusculo)) return maiusculo;
  const minusculo = pedaco.toLowerCase();
  if (MINUSCULAS.has(minusculo)) return minusculo;
  // Curta e sem vogal e sigla: "LTZ", "TRD".
  if (pedaco.length <= 3 && !/[aeiouy]/i.test(pedaco)) return maiusculo;
  return minusculo.charAt(0).toUpperCase() + minusculo.slice(1);
}

const caixaDaPalavra = (palavra: string) =>
  // BYD escreve "DM-i": o "i" depois do hifen fica minusculo.
  /^dm-i$/i.test(palavra)
    ? "DM-i"
    : palavra.split(/([-/])/).map((p) => (p === "-" || p === "/" ? p : caixaDoPedaco(p))).join("");

function tirarMarcaDoComeco(texto: string, marca?: string | null): string {
  const marcas = [marca, ...MARCAS]
    .filter((m): m is string => !!m)
    .map((m) => m.toUpperCase())
    .sort((a, b) => b.length - a.length);
  let resto = texto;
  // Repete: "GWM GWM HAVAL" tem a marca duas vezes.
  for (let tirou = true; tirou; ) {
    tirou = false;
    for (const m of marcas) {
      // "RAM 2500": aqui a marca e o nome do modelo.
      if (m === "RAM" && /^\s*\d/.test(resto.slice(m.length))) continue;
      const cabeca = resto.slice(0, m.length).toUpperCase();
      const depois = resto.charAt(m.length);
      if (cabeca === m && (depois === "" || /[\s/-]/.test(depois))) {
        const sobra = resto.slice(m.length).replace(/^[\s/-]+/, "");
        if (!sobra) return resto;
        resto = sobra;
        tirou = true;
        break;
      }
    }
  }
  return resto;
}

/**
 * O titulo do anuncio, sem os asteriscos do negrito.
 *
 * Com `rawDescription` (o texto ORIGINAL do vendedor), o combustivel so entra
 * se estiver escrito nele -- carro capturado antes de 21/09/2026 pode ter o
 * combustivel que a IA deduziu pelo modelo.
 */
export function tituloDoAnuncio(v: {
  model: string;
  brand?: string | null;
  fuel?: string | null;
  transmission?: string | null;
  rawDescription?: string | null;
}): string {
  const fuel = v.rawDescription ? combustivelConfirmado(v.fuel, v.rawDescription) : v.fuel;
  let t = (v.model || "").replace(/[*_~`]/g, " ").replace(/\s+/g, " ").trim();
  t = tirarMarcaDoComeco(t, v.brand);

  t = t
    // Ano ("2022", "2022/2023", "22/23") -- ja vem na linha de baixo.
    .replace(/\b(19|20)\d{2}(\s*\/\s*((19|20)?\d{2}))?\b/g, " ")
    .replace(/\b\d{2}\s*\/\s*\d{2}\b/g, " ")
    // Km -- tambem ja vem abaixo.
    .replace(/\b[\d.,]+\s*(mil\s*)?km\b/gi, " ")
    // Cambio escrito no modelo: o rotulo padrao entra no fim.
    .replace(/\((?:aut\.?|autom[aá]tic[oa]|manual|mec\.?|mec[aâ]nic[oa]|cvt|h[ií]brido)\)/gi, " ")
    .replace(/(^|\s)(?:aut(?:om)?\.?|autom[aá]tic[oa]|manual|mec\.?|mec[aâ]nic[oa]|cvt|c[aâ]mbio)(?=\s|$)/gi, " ")
    .replace(/(\S\s+)at(?=\s|$)/gi, "$1")
    // "Limited+" -> "Limited": o cliente nao quer o "+" no titulo.
    .replace(/\s*\+(?=\s|$)/g, "");
  // O combustivel fica (o cliente, 21/09/2026). So o hibrido sai, porque vira
  // o rotulo "(híbrido)" no fim.
  if (fuel === "HIBRIDO") t = t.replace(/(^|\s)(?:h[ií]brido|hybrid)(?=\s|$)/gi, " ");
  // "1.0 MT" repete o "(manual)" do fim -- so sai quando o rotulo vai entrar.
  if (v.transmission) t = t.replace(/(\S\s+)mt(?=\s|$)/gi, "$1");

  // Turbo colado na motorizacao: "1.6 Turbo" / "1.6 TB" / "1.6turbo" -> "1.6T".
  // O codigo de torque da Fiat fica solto ("1.3 T270" -> "1.3T 270") e o que
  // vem antes do T some ("1.0 200 T." -> "1.0T"), como o cliente escreveu.
  t = t
    .replace(/\b(\d\.\d)\s+\d{3}\s*t\.?(?=\s|$)/gi, "$1T")
    .replace(/\b(\d\.\d)\s*t(\d{2,3})\b/gi, "$1T $2")
    .replace(/\b(\d\.\d)\s*(?:turbo|tb|t)\b/gi, "$1T");
  if (/(^|\s)(?:turbo|tb)(?=\s|$)/i.test(t)) {
    const motor = t.match(/\b\d\.\d(?!T)\b/i);
    if (motor) {
      t = t.replace(motor[0], `${motor[0]}T`).replace(/(^|\s)(?:turbo|tb)(?=\s|$)/gi, " ");
    }
  }

  const palavras: string[] = [];
  for (const palavra of t.split(/\s+/).filter(Boolean)) {
    const formatada = caixaDaPalavra(palavra);
    if (palavras.at(-1)?.toUpperCase() !== formatada.toUpperCase()) palavras.push(formatada);
  }
  let titulo = palavras.join(" ").replace(/^[\s\-|,.:]+|[\s\-|,:]+$/g, "").trim();
  if (!titulo) titulo = caixaDaPalavra((v.model || "").trim());

  // Combustivel escrito fora da linha do modelo ("TORO 1.3 T270 VOLCANO" e,
  // embaixo, "FLEX") entra antes do cambio: "Toro 1.3T 270 Volcano Flex (aut.)".
  const combustivel = fuel ? COMBUSTIVEL_ESCRITO[fuel] : undefined;
  if (combustivel && !combustivel.escrito.test(titulo)) titulo = `${titulo} ${combustivel.rotulo}`;

  const rotulo = getTransmissionLabel(fuel ?? undefined, v.transmission ?? undefined);
  return rotulo ? `${titulo} ${rotulo}` : titulo;
}

/** Troca o valor da linha "Por:" -- usado so em texto gerado pelo sistema. */
export function trocarPrecoDeVenda(texto: string, valor: number): string {
  const linha = `Por: *${priceFormatted(valor)}*`;
  return /^Por:.*$/m.test(texto) ? texto.replace(/^Por:.*$/m, linha) : `${texto}\n${linha}`;
}

/**
 * O preco de venda escrito na linha "Por:" do anuncio.
 *
 * O texto do card e o que vai pro grupo: quando o operador digita o preco
 * dele ali, esse e o preco de venda. Entende "Por: *129.800,00*",
 * "Por 186.000", "POR: R$ 129.900" e "Por: 129 mil". Pega a ultima linha
 * valida -- "Por dentro, impecavel" ou "Por 2 anos" nao sao preco.
 */
export function lerPrecoDeVenda(texto: string | null | undefined): number | null {
  return lerValorDaLinha(texto, "por");
}

/** A Fipe da linha "Fipe:" do anuncio -- a que o operador digitou, se mexeu nela. */
export function lerFipeDoAnuncio(texto: string | null | undefined): number | null {
  return lerValorDaLinha(texto, "fipe");
}

/** O valor da ultima linha que comeca pelo rotulo, em qualquer das grafias acima. */
function lerValorDaLinha(texto: string | null | undefined, rotulo: string): number | null {
  if (!texto) return null;
  let achado: number | null = null;
  const linha = new RegExp(String.raw`^[\s*_~]*${rotulo}\b[\s:*_~]*(?:r\$)?[\s*_~]*([\d.,]+)\s*(mil)?`, "gim");
  for (const m of texto.matchAll(linha)) {
    const bruto = m[1];
    const valor = m[2]
      ? parseFloat(bruto.replace(",", ".")) * 1000
      : parseFloat(bruto.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    if (Number.isFinite(valor) && valor >= 1000) achado = valor;
  }
  return achado;
}

/** O texto do operador vai como esta; sem linha "Por:", ganha a do sistema. */
export function garantirPrecoDeVenda(texto: string, valor: number): string {
  return lerPrecoDeVenda(texto) === null ? `${texto}\nPor: *${priceFormatted(valor)}*` : texto;
}

/**
 * O anuncio que aparece para o operador. Texto editado por ele vai como esta;
 * o gerado pelo sistema ganha o titulo no padrao atual (os antigos foram
 * salvos com marca e em maiusculas).
 */
export function anuncioParaExibir(v: {
  formattedAd?: string | null;
  adEditedAt?: string | Date | null;
  model: string;
  brand?: string | null;
  fuel?: string | null;
  transmission?: string | null;
  rawDescription?: string | null;
}): string | null {
  const texto = v.formattedAd?.trim();
  if (!texto) return null;
  if (v.adEditedAt) return texto;
  const [primeira, ...resto] = texto.split("\n");
  if (!/^\*.+\*$/.test(primeira.trim())) return texto;
  return [`*${tituloDoAnuncio(v)}*`, ...resto].join("\n");
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
    brand?: string | null;
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
  // 8. "2023/2024" sai "2023/24" -- o ano do modelo so com os dois digitos.
  const yearDisplay = vehicle.yearModel && vehicle.yearModel !== vehicle.year
    ? `${vehicle.year}/${String(vehicle.yearModel).slice(-2)}`
    : `${vehicle.year}`;

  // --- First line: titulo no padrao (bold for WhatsApp) ---
  // O cliente pediu SEM marca (antes a marca era forcada em maiusculas).
  // Sem o rawDescription: aqui ele pode ser o texto ja limpo pela IA, que as
  // vezes tira a linha "FLEX". Quem chama manda o combustivel ja conferido.
  const modelLine = `*${tituloDoAnuncio({ ...vehicle, rawDescription: null })}*`;

  // --- Build ad ---
  // Format: bold title, year|km, then rawDescription body (original seller text),
  // then Fipe + selling price. Features from AI are NOT used — the rawDescription
  // already contains the human-written description which reads better.

  const lines: string[] = [
    modelLine,
    `${yearDisplay} | ${kmFmt}km`,
  ];

  if (vehicle.rawDescription?.trim()) {
    // Clean the raw description into Don Felipe format:
    // - Remove ALL emojis
    // - Remove lines that are: model name, year, km, price, fipe, "pedida", location pin
    // - Remove * bold markers
    // - Keep only the "features / description" lines

    const cleaned = vehicle.rawDescription.trim()
      // Remove marcadores de formatacao do WhatsApp: *negrito*, ~tachado~, _italico_
      .replace(/[*~_]/g, "")
      // Remove all emojis and special unicode symbols. A faixa 2300-23FF
      // entrou por causa da ampulheta do "⏳ Ano:", que segurava a linha.
      .replace(/[\u{1F000}-\u{1FFFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}✅✓☑️📊💰📍🔥⚡🚗🏎️⭐🔑]/gu, "");

    /**
     * O km abre a linha mas o resto dela e informacao do carro:
     * "27 mil km Todas revisões na concessionária". O km ja esta no
     * cabecalho; jogar a linha inteira fora levava a revisao junto.
     */
    const semKmNaFrente = (l: string) => {
      const resto = l.replace(/^\s*(?:km\s*:?\s*)?[\d.,]+\s*(?:mil\s*)?km\b[\s:,.\-–|]*/i, "");
      return resto.length > 3 ? resto : l;
    };

    const modelFirstWord = vehicle.model.toLowerCase().split(" ")[0];
    // No padrao ANTES dos filtros: "Faz 2 peças" cairia como linha de preco
    // ("Faz 127.000"), e uma linha pode virar duas ("Manual, sem chave cópia").
    const descLines = cleaned.split("\n").flatMap((l) => padronizarLinha(semKmNaFrente(l)));
    let bodyLines: string[] = [];
    // O cambio que foi pro titulo nao se repete no corpo. "Manual" sozinho so
    // e cambio em carro manual -- no automatico e o manual do dono.
    const temRotulo = !!getTransmissionLabel(vehicle.fuel ?? undefined, vehicle.transmission ?? undefined);
    const CAMBIO =
      /^(?:c[aâ]mbio\s*:?\s*)?(?:autom[aá]tic[oa]|automatizad[oa]|mec[aâ]nic[oa]|cvt|aut\.?|at|manual)(?:\s+(?:de\s+)?\d+\s*(?:marchas|velocidades|vel\.?))?$/i;

    for (const l of descLines) {
      const lower = l.toLowerCase();
      // O que o vendedor disser da placa fica, com cidade ou estado no meio.
      const dePlaca = /^placa\b/i.test(l);

      // Skip empty lines at the very start
      if (bodyLines.length === 0 && !l) continue;

      // Skip lines that match data we already show in the header/footer
      if (
        // Model name line. A primeira e o titulo do vendedor, de qualquer
        // tamanho: com marca, versao e ano passa facil de 60 caracteres.
        lower.includes(modelFirstWord) && (bodyLines.length === 0 || lower.length < 60 && bodyLines.length < 3) ||
        // Year line: "Ano 2025", "ANO/MOD: 2023/2024", "2025" ou "2024/2025"
        /^(ano\s*(?:\/\s*mod(?:elo)?)?\s*:?\s*)?\d{4}\s*([\/|]\s*\d{2,4})?\s*$/i.test(l) ||
        // KM line: "KM 35.000", "Km: 46 mil", "35.000 km" (linha inteira)
        /^(km\s*:?\s*)?[\d.,]+\s*(mil\s*)?(km)?\s*$/i.test(l) ||
        // Ano e km juntos: "2022 | 55.000km", "2019/2020 - 80 mil km"
        /^\d{4}(\s*\/\s*\d{2,4})?\s*[|\-–•]\s*[\d.,]+\s*(mil\s*)?km\b/i.test(l) ||
        // Linha que COMECA repetindo o KM, mesmo com texto depois.
        // Ex: "153.000KM rev ate 90 manual" -- o KM ja esta no cabecalho.
        /^[\d.,]+\s*(mil\s*)?km\b/i.test(l) ||
        // "KM 153.000 ..." (prefixo KM + numero + texto)
        /^km\s*:?\s*[\d.,]+/i.test(l) ||
        // Price lines: "R$ 360.900" "Pedida R$ 360.900" "Fipe R$ 381.000"
        // "Faço R$ 65.900" "Custo 199.998" "Por: 217.998" "Faz 127.000"
        // "Pra hj 122.000" "Tabela 138.000" "Sinal 5.000" "Entrada 20.000"
        // O sistema gera a propria secao Fipe/Por -- nada de preco vaza pro corpo.
        /^(fipe|fifa|pedida|preciso(\s*de)?|faço|faco|faz|valor|preco|preço|por|custo|tabela|sinal|entrada|à\s*vista|a\s*vista|pra\s*(hoje|hj))\s*:?\s*r?\$?\s*~?\s*[\d.,]+/i.test(l) ||
        // Bare price: "R$ 360.900" or just "360.900"
        /^r?\$?\s*[\d.,]+\s*(mil|reais)?\s*$/i.test(l) ||
        // Frases de marketing/chamada do vendedor da fonte -- nao entram no
        // anuncio da Don Felipe ("Oportunidade menor valor Brasil", etc).
        /\b(oportunidade|menor\s*(valor|pre[çc]o)|mais\s*barat[ao]|melhor\s*(valor|pre[çc]o|oferta)|imperd[ií]vel|aproveite|n[ãa]o\s*perc|super\s*oferta|abaixo\s*da\s*(tabela|fipe)|baita\s*(neg[óo]cio|oferta)|promo[çc][ãa]o|ultim[ao]s?\s*(unidade|dia))\b/i.test(l) ||
        // Frases de NEGOCIACAO do vendedor da fonte -- nao entram no anuncio
        // ("Analisa proposta", "Aceito troca", "Comigo", "Negociavel"...).
        /\b(analis[ao]|aceito|estudo|fa[çc]o|escuto|ou[çv]o)\s+(proposta|oferta|troca)/i.test(l) ||
        /\bproposta\s*(coerente|justa|s[ée]ria|real)/i.test(l) ||
        /\b(neg[oó]ci[aá]vel|aceito\s*troca|estudo\s*troca|aceita\s*troca|sem\s*troca)\b/i.test(l) ||
        /^(comigo|chama|chame|fale|falar|tratar|direto\s*comigo)[\s.!]*$/i.test(l) ||
        /^pra?\s*(hoje|hj|fechar|negociar)\b/i.test(l) ||
        temRotulo && CAMBIO.test(l) && !(/^manual$/i.test(l) && vehicle.transmission !== "MANUAL") ||
        // Location pin: "SP" or "📍 SP" (emoji already stripped, so just "SP")
        /^[A-Z]{2}$/i.test(l) && l.length === 2 ||
        // Regiao solta ("📍 Nordeste", emoji ja removido) -- localizacao nao vai no anuncio.
        /^(nordeste|norte|sul|sudeste|centro[\s-]?oeste)$/i.test(l) ||
        // Transmission/fuel already in title
        /^(automático|automatico|cvt|flex|diesel|híbrido|hibrido)\s*$/i.test(l) ||
        !temRotulo && /^manual$/i.test(l) ||
        // "Combustivel: FLEX", "Cambio: AUTOMATICA", "Modelo: ..." -- ja no titulo.
        /^(combust[ií]vel|c[aâ]mbio|cambio|marca|modelo)\s*:/i.test(l) ||
        // Remove location lines
        !dePlaca && /\b(em\s+estoque|carro\s+em|localiza[çc][ãa]o|disponível\s+em|disponivel\s+em)\b/i.test(l) ||
        !dePlaca && /\b(florian[oó]polis|porto\s+alegre|curitiba|blumenau|joinville|itaja[ií]|canoas|caxias|maring[aá]|pelotas|navegantes|s[ãa]o\s+paulo|belo\s+horizonte|londrina)\b/i.test(l) ||
        // Remove phone numbers
        /\(?\d{2}\)?\s*9?\s*\d{4}[-.\s]?\d{4}/.test(l) ||
        // Remove WhatsApp contact lines
        (/\b(whats|contato|fone|tel|liga|chama)\b/i.test(l) && /\d{4}/.test(l)) ||
        // Remove repasse/group lines
        /\b(repasse|grupo\s+de|lista\s+de|entre\s+em\s+contato)\b/i.test(l) ||
        // Cabecalho e condicoes do fornecedor: "ESSE VEICULO ESTA EM (cidade)",
        // "agendar visita ou enviamos o veiculo apos o pagamento".
        /\b(agendar?|agende|enviamos|entregamos|atendemos|estamos|consulte)\b/i.test(l) ||
        /\bap[óo]s\s*o\s*pagamento\b/i.test(l) ||
        /^(esse|este)\s+ve[ií]culo\b/i.test(l)
      ) {
        continue;
      }

      bodyLines.push(l);
    }

    // Dois blocos (regra 9 do cliente): o bom do curto pro longo, uma linha em
    // branco, o que precisa ser feito do longo pro curto.
    bodyLines = montarCorpo(bodyLines);

    if (bodyLines.length > 0) {
      lines.push("");
      lines.push(...bodyLines);
    } else if (featuresList.length > 0) {
      // A limpeza removeu TODAS as linhas do anuncio original (anuncio era
      // so preco/negociacao/contato). Usa as features extraidas pela IA pra
      // o anuncio nao sair vazio.
      lines.push("");
      featuresList.forEach((f) => lines.push(f));
    }
  } else if (featuresList.length > 0) {
    // Fallback: if no rawDescription, use AI-extracted features
    lines.push("");
    featuresList.forEach((f) => lines.push(f));
  }

  lines.push("");

  if (vehicle.fipePrice != null) {
    lines.push(`Fipe: ${priceFormatted(vehicle.fipePrice)}`);
  }

  // Bold price for WhatsApp
  lines.push(`Por: *${sellingPriceFmt}*`);

  return lines.join("\n");
}
