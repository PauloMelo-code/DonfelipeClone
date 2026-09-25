import type { VehicleData } from "./tipos";
import { parseBrazilianNumber } from "./numeros";
import { detectarCambio, ELETRICO } from "./cambio";
import { detectarEstado } from "../estados";

// ---------------------------------------------------------------------------
// Extracao por regex: a tentativa gratuita.
//
// Roda antes de qualquer IA. Quando acerta, o anuncio nao custa token nenhum.
// As heuristicas aqui carregam cicatriz de campo: linha de IPVA que era lida
// como ano do carro, FIPE lida como preco, frase de loja lida como modelo,
// "manual do proprietario" lido como cambio, "450HP" lido como km.
// ---------------------------------------------------------------------------

const BRANDS = [
  "TOYOTA", "HONDA", "HYUNDAI", "CHEVROLET", "VOLKSWAGEN", "VW", "FIAT",
  "FORD", "NISSAN", "JEEP", "MITSUBISHI", "KIA", "RENAULT", "PEUGEOT",
  "CITROEN", "BMW", "MERCEDES", "AUDI", "VOLVO", "LAND ROVER", "JAGUAR",
  "PORSCHE", "SUBARU", "SUZUKI", "CHERY", "CAOA CHERY", "BYD", "GWM",
  "RAM", "DODGE", "CHRYSLER", "MINI", "LEXUS", "INFINITI", "MASERATI",
];

// ---------------------------------------------------------------------------
// Regex Vehicle Extractor (ZERO COST — no AI calls)
// ---------------------------------------------------------------------------

/**
 * 29. O rotulo da Fipe nem sempre e "Fipe": o vendedor escreve "Tabela
 * 134.000" ou erra pra "Fifa". Pelo contexto -- rotulo seguido de valor --
 * e a mesma coisa, e nunca e o preco de venda.
 */
const ROTULO_FIPE = /\b(fipe|fifa|tabela)\b/i;

/**
 * Valor de anuncio de concorrente ("Mais barata anunciada no Brasil
 * (Webmotors) R$ 179.900"). Nao e a FIPE deste carro nem o que o vendedor
 * pede por ele: o anuncio saia com uma FIPE que nao existe e, pior, com o
 * preco do concorrente no lugar da pedida.
 */
const DE_CONCORRENTE =
  /\b(mais\s*barat[ao]|menor\s*(valor|pre[çc]o)|anunciad[ao]|webmotors|olx|mercado\s*livre|icarros|usadosbr)\b/i;

export function extractWithRegex(text: string): VehicleData | null {
  const clean = text
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}]/gu, "")
    .trim();

  if (!clean || clean.length < 20) return null;

  const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean);

  // --- Year ---
  // CRITICAL: ignorar linhas de IPVA/licenciamento. "IPVA 2026 pago" NAO eh
  // o ano do carro -- o regex pegava 2026 e o anuncio saia com ano errado.
  const isIpvaLine = (l: string) =>
    /\b(ipva|licenciamento|licenciad[oa]|seguro|multa|placa)\b/i.test(l);
  let year: number | null = null;
  let yearModel: number | null = null;
  for (const line of lines) {
    if (isIpvaLine(line)) continue; // pula linha de IPVA/licenciamento
    // "2022/2023" or "22/23" or "2022/23"
    const ym = line.match(/\b(20\d{2})\s*[\/]\s*(20\d{2}|\d{2})\b/);
    if (ym) {
      year = parseInt(ym[1]);
      const ym2 = ym[2].length === 2 ? 2000 + parseInt(ym[2]) : parseInt(ym[2]);
      // So vale como ano de modelo o que anda junto do ano de fabricacao:
      // "2019/97" e km, nao modelo 2097.
      yearModel = ym2 >= year - 1 && ym2 <= year + 1 ? ym2 : null;
      break;
    }
    // "Ano 2022" or "Ano: 2022"
    const yOnly = line.match(/\bano\s*:?\s*(20\d{2})\b/i) || line.match(/\b(20\d{2})\b/);
    if (yOnly && !year) {
      const y = parseInt(yOnly[1]);
      if (y >= 2010 && y <= 2030) { year = y; }
    }
  }

  // --- KM ---
  let km: number | null = null;
  // IMPORTANTE: ordem dos patterns importa. Patterns mais especificos (km/quilometragem
  // como prefixo) vem ANTES do generico "X.XXX km" que poderia confundir com ano.
  // O espaco depois de "km" e SO da mesma linha: com `\s*`, "84.000 Km" seguido
  // de "450HP" na linha de baixo virava km=450.
  const kmPatterns = [
    // "Km: 46 mil" -- o rotulo antes do numero, com "mil" depois.
    /\b(?:km|quilometragem)[ \t]*:?[ \t]*(\d{1,3})[ \t]*mil\b/i,
    /\bquilometragem[ \t]*:?[ \t]*([\d.,]+)/i,
    /\bkm[ \t]*:?[ \t]*([\d.,]+)/i,
    /\b(\d{2,3})[ \t]*mil[ \t]*km\b/i,
    /\b([\d.,]+)[ \t]*km\b/i,
  ];
  for (const p of kmPatterns) {
    // TODAS as ocorrencias do padrao, e nao so a primeira: o primeiro "km" do
    // texto costuma ser de pneu ("4 pneus 0km") e a quilometragem de verdade
    // vem na linha seguinte. Com `match`, rejeitar o zero fazia o extrator
    // desistir do padrao inteiro e perder o "85.000 km" logo abaixo.
    const global = new RegExp(p.source, p.flags.includes("g") ? p.flags : p.flags + "g");
    for (const m of clean.matchAll(global)) {
      let n: number | null;
      if (/mil/i.test(m[0])) {
        n = parseInt(m[1]) * 1000;
      } else {
        n = parseBrazilianNumber(m[1]);
      }
      // Rejeita valores que parecem ano (1900-2099 com exatamente 4 digitos sem ponto)
      const raw = m[1].replace(/[.,\s]/g, "");
      if (n !== null && raw.length === 4 && /^(19|20)\d{2}$/.test(raw)) continue;
      // KM razoavel: acima de zero, ate 999.999.
      //
      // O piso e ZERO, e nao mil: a Hilux do cliente anuncia "97km" querendo
      // dizer 97 mil, e quem conserta isso e o `validateAndFix`. Mas o zero
      // nunca e quilometragem -- ele vem de "4 pneus 0km", onde fala dos
      // PNEUS. Sem este corte, um Corolla 2019 saia no grupo como
      // "2019 | 0km", com a margem zerada e a nota inflada em dois pontos
      // (25/09/2026).
      if (n !== null && n > 0 && n <= 999999) {
        km = n;
        break;
      }
    }
    if (km !== null) break;
  }

  // --- FIPE (extrai PRIMEIRO pra poder excluir essa linha do preco) ---
  // Anuncios trazem ate 2 FIPEs: "Fipe 0km R$180.000" e "Fipe usado
  // R$159.000". Pra carro de repasse (usado) queremos a FIPE do USADO.
  // Cuidado: "Fipe 0km" tem o "0" que NAO eh o valor.
  let fipePrice: number | null = null;
  {
    // Extrai o valor de uma linha de fipe: prioriza valor apos "R$";
    // senao pega o primeiro numero >= 1000 (ignora "0" de "0km").
    const extractFipeValue = (line: string): number | null => {
      const afterRS = line.match(/r\$\s*([\d.,]+)/i);
      if (afterRS) {
        const n = parseBrazilianNumber(afterRS[1]);
        if (n !== null && n >= 1000) return n;
      }
      const nums = line.match(/[\d][\d.,]*/g) || [];
      for (const raw of nums) {
        const n = parseBrazilianNumber(raw);
        if (n !== null && n >= 1000) return n;
      }
      // "fipe 180 mil"
      const milM = line.match(/([\d.,]+)\s*mil/i);
      if (milM) {
        const n = parseFloat(milM[1].replace(",", ".")) * 1000;
        if (!isNaN(n) && n >= 1000) return n;
      }
      return null;
    };
    let fipeUsado: number | null = null;
    let fipeZeroKm: number | null = null;
    let fipeOutra: number | null = null;
    for (const fl of lines) {
      if (!ROTULO_FIPE.test(fl)) continue;
      const val = extractFipeValue(fl);
      if (val === null) continue;
      if (/\b(usad[oa]|seminov[oa]?)\b/i.test(fl)) fipeUsado = val;
      else if (/\b(0\s*km|zero\s*km|nov[oa])\b/i.test(fl)) fipeZeroKm = val;
      else fipeOutra = val;
    }
    // Carro de repasse eh usado -> prioriza a FIPE do usado.
    fipePrice = fipeUsado ?? fipeOutra ?? fipeZeroKm;
  }

  // --- Price ---
  // CRITICAL: nunca usar uma linha que menciona "fipe" como preco de venda.
  let price: number | null = null;
  const priceText = lines.filter((l) => !ROTULO_FIPE.test(l) && !DE_CONCORRENTE.test(l)).join("\n");
  const pricePatterns = [
    /(?:pedid[ao]|preciso(?:\s+de)?|faço|faco|valor|vendo|venda|preço|preco|por|repasse)\s*:?\s*r?\$?\s*([\d.,]+\s*(?:mil)?)/i,
    /r\$\s*([\d.,]+\s*(?:mil)?)/i,
    /(?:^|\n)\s*([\d]{2,3}[.\s]?\d{3}(?:,\d{2})?)\s*$/m,
  ];
  for (const p of pricePatterns) {
    const m = priceText.match(p);
    if (m) {
      price = parseBrazilianNumber(m[1]);
      if (price !== null && price >= 10000) break;
      price = null;
    }
  }

  // --- NORMALIZACAO FIPE/PRECO sem rotulo explicito ---
  // Padrao comum: anuncio com 2 valores R$, o de cima e a FIPE (as vezes
  // riscada/tachada) e o de baixo (em negrito *...*) e o preco de venda.
  // Sem a palavra "FIPE", o regex acima nao detecta a FIPE.
  //
  // Heuristica:
  //  - Pega TODOS os valores R$ do texto (>= 10mil, <= 2mi)
  //  - Filtra valores que aparecem em linha de FIPE (ja extraidos antes)
  //  - Se sobrarem 2+ valores DIFERENTES:
  //      * MAIOR  = FIPE (se ainda nao tem)
  //      * MENOR  = preco de venda
  //  - Preserva marcacao de negrito (*X*) como hint de preco de venda
  if (fipePrice === null) {
    const allValues: { value: number; bold: boolean; raw: string }[] = [];
    const seenInFipeLines = new Set<number>();
    // Marca valores que estao em linha com "fipe" pra ignorar
    for (const fl of lines) {
      if (!ROTULO_FIPE.test(fl)) continue;
      const nums = fl.match(/r?\$?\s*[\d][\d.,]*/g) || [];
      for (const raw of nums) {
        const n = parseBrazilianNumber(raw.replace(/r\$\s*/i, ""));
        if (n !== null) seenInFipeLines.add(n);
      }
    }
    // Coleta os R$ do texto, marcando se estao entre asteriscos (negrito).
    for (const linha of lines) {
      if (DE_CONCORRENTE.test(linha)) continue;
      const moneyRegex = /(\*?)\s*r?\$\s*([\d][\d.,]*)\s*(\*?)/gi;
      let match: RegExpExecArray | null;
      while ((match = moneyRegex.exec(linha)) !== null) {
        const n = parseBrazilianNumber(match[2]);
        if (n === null || n < 10000 || n > 2_000_000) continue;
        if (seenInFipeLines.has(n)) continue;
        const bold = match[1] === "*" || match[3] === "*";
        allValues.push({ value: n, bold, raw: match[0] });
      }
    }
    // De-duplica mantendo a primeira ocorrencia
    const unique: typeof allValues = [];
    const seen = new Set<number>();
    for (const v of allValues) {
      if (seen.has(v.value)) continue;
      seen.add(v.value);
      unique.push(v);
    }
    if (unique.length >= 2) {
      // Existe um marcado em negrito? Esse e o preco de venda
      const bolded = unique.find((v) => v.bold);
      // Maior valor = candidato a FIPE
      const sortedDesc = [...unique].sort((a, b) => b.value - a.value);
      const maxVal = sortedDesc[0].value;
      const minVal = sortedDesc[sortedDesc.length - 1].value;
      // So aplica heuristica se a diferenca for plausivel (3-50% -- repasses)
      const discount = (maxVal - minVal) / maxVal;
      if (discount >= 0.03 && discount <= 0.5) {
        fipePrice = maxVal;
        // Se nao tem preco ou preco eh igual a FIPE, usa o menor como venda
        if (price === null || price === maxVal) {
          price = bolded?.value ?? minVal;
        }
        console.log(`[regex] FIPE inferida sem rotulo: ${maxVal} (venda=${price}, desconto=${(discount * 100).toFixed(1)}%)`);
      }
    }
  }

  // Salvaguarda: se o preco extraido eh identico a FIPE, quase certamente
  // foi a FIPE copiada por engano (anuncio sem valor de oferta real).
  if (price !== null && fipePrice !== null && price === fipePrice) {
    console.log("[regex] price == fipePrice, descartando price (anuncio provavelmente sem oferta)");
    price = null;
  }

  // --- Transmission --- (ver cambio.ts: "manual e chave" nao e cambio)
  const transmission = detectarCambio(clean);

  // --- Fuel ---
  let fuel: string | undefined;
  if (/\b(h[ií]brid[oa]|hybrid)\b/i.test(clean)) fuel = "HIBRIDO";
  else if (/\bdiesel\b/i.test(clean)) fuel = "DIESEL";
  else if (ELETRICO.test(clean)) fuel = "ELETRICO";
  else if (/\bflex\b/i.test(clean)) fuel = "FLEX";
  else if (/\bgasolina\b/i.test(clean)) fuel = "GASOLINA";
  else if (/\betanol\b/i.test(clean)) fuel = "ETANOL";

  // --- Model (first non-empty line that looks like a vehicle name) ---
  // Lista de CHAMADAS promocionais que aparecem como header de loja/anuncio
  // mas NAO sao modelo. Ex: "Menor valor Brasil", "Oportunidade", "VAAPTY ITAJAI"
  const PROMO_PHRASES: RegExp[] = [
    /^menor\s*(valor|pre[çc]o)\s*(do\s*)?(brasil|sul|pa[ií]s)?/i,
    /^oportunidade\b/i,
    /^imperd[ií]vel/i,
    /^melhor\s*(oferta|pre[çc]o|valor|neg[oó]ci)/i,
    /^aproveite/i,
    /^promo[çc][ãa]o\b/i,
    /^baita\s*(neg|oferta)/i,
    /^abaixo\s*da\s*(tabela|fipe)/i,
    /^super\s*oferta/i,
    /^ultim[ao]s?\s*(unidade|dia)/i,
    /^repassey/i,
    /^vaapty/i,
    /^caarpix/i,
    /^go\s*repasses/i,
    /^repasse[s]?\s*(sul|brasil|premium|vip|porto|alegre)/i,
    /^contatos?\b/i,
    /^historico\s*(premium|completo)/i,
    /^hist[oó]rico\s*premium/i,
    /^aval[ií]a[çc][aã]o\s*superficial/i,
    /^carro\s*(de|para|do)\s*(repasse|garagem)/i,
    /^carros?\s*(novos|seminovos|usados)/i,
    /^\s*(loja|repasse|garagem|consultoria)\b/i,
    /^para\s*(o\s*)?seu\s*showroom/i,
    /^acompanha\s*(manual|chave)/i,
    /^baixou+/i,
    // 6. "TIGGO 7 SELECIONADA PARA O ESTOQUE" e chamada, nao o nome do carro.
    /\bselecionad[ao]\s+(para|pro|pra)\b/i,
    /^(chegou|novidade|acabou\s*de\s*chegar|dispon[ií]vel\s+(hoje|agora))\b/i,
    /^para\s*vender\s*agora/i,
    /^exclusividade\b/i,
    /^edicao\s*(limitada|especial|exclusiva)/i,
    /^lan[çc]amento\b/i,
    /^reservad[ao]\b/i,
    /^apenas\s*\d+\s*(unidade|carro)/i,
    /^[uú]nic[ao]s?\s+\d+\s*(anunciad|disponivel|no\s*brasil)/i,
    /^so\s*aqui\b/i,
    // Padrao generico de loja: "<NOME> PORTO ALEGRE" "<NOME> SC" "<NOME> SUL"
    /^[A-ZÀ-Ú][A-ZÀ-Ú0-9\s]+\s+(porto\s*alegre|s[ãa]o\s*paulo|florian[oó]polis|curitiba|sul|brasil)\s*$/i,
  ];
  const isPromoLine = (l: string) => PROMO_PHRASES.some((p) => p.test(l));

  /**
   * Frase do vendedor, nao modelo. Ha fornecedor que escreve um cabecalho
   * antes do anuncio ("ESSE VEICULO ESTA EM ... agendar visita", "Mercadoria
   * boa e com margem"), e o titulo saia com a frase no lugar do carro.
   */
  const FRASE_DE_LOJA =
    /\b(esse|este|esta|essa|nosso|nossa|voc[eê]|agendar?|agende|enviamos|entregamos|entrega|estamos|atendemos|aceitamos|consulte|whats|pagamento|visita|financia|parcel|cr[ée]dito|troca|dispon[ií]vel|mercadoria|margem|lucro|barat[oa]|oferta|neg[oó]cio|pre[çc]o|valor|bom|boa|[óo]tim[oa]|excelente)\b/i;
  /**
   * Linha de campo do anuncio: "Ano: 2025", "Km: 46 mil", "Cambio: ...".
   * A palavra tem que ser inteira -- sem isso "COROLLA" casava com "cor".
   */
  const LINHA_DE_CAMPO =
    /^(?:r\$|(?:ano|km|quilometragem|pre[çc]o|valor|fipe|pedido|cor|combust[ií]vel|c[aâ]mbio|cambio|ipva|placa|chave|manual|final|motor|portas?|opcionais|garantia|estado|local)\b)/i;

  /**
   * 19. "FIAT" sozinho numa linha e a MARCA -- o modelo ("TORO 1.3 T270
   * VOLCANO") vem na linha de baixo. Sem isso o titulo saia "Fiat (aut.)".
   */
  const soMarca = (l: string) => {
    const x = l.toUpperCase().replace(/[^A-Z\s-]/g, "").replace(/\s+/g, " ").trim();
    return BRANDS.includes(x) || x === "VW" || x === "GM";
  };

  const pareceModelo = (l: string) =>
    l.length >= 3 && l.length <= 60 &&
    l.split(/\s+/).length <= 10 &&
    /[a-zà-ú]{2}/i.test(l) &&
    !/^\d+$/.test(l) &&
    !LINHA_DE_CAMPO.test(l) &&
    !FRASE_DE_LOJA.test(l) &&
    !soMarca(l) &&
    !isPromoLine(l);

  // Le o texto ORIGINAL: o carrinho que o vendedor poe antes do modelo some
  // no `clean`, e e o melhor sinal de qual linha e o carro.
  const EMOJI_DE_CARRO = /[\u{1F690}\u{1F697}\u{1F698}\u{1F699}\u{1F69A}\u{1F6FB}\u{1F3CE}]/u;
  const candidatas = text
    .split("\n")
    .map((l) => ({
      bruta: l.trim(),
      texto: l
        .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}]/gu, "")
        .replace(/[*_~`]/g, "")
        .trim(),
    }))
    .filter((c) => c.texto);

  let model: string | null = null;
  let brand: string | undefined;

  // PASSADA 1: o vendedor escreveu "Modelo: ..."
  for (const c of candidatas.slice(0, 12)) {
    const rotulado = c.texto.match(/^(?:modelo|ve[ií]culo|carro)\s*:\s*(.+)$/i);
    if (rotulado && pareceModelo(rotulado[1].trim())) {
      model = rotulado[1].trim();
      break;
    }
  }

  // PASSADA 2: a linha marcada com o carrinho
  if (!model) {
    for (const c of candidatas.slice(0, 12)) {
      if (EMOJI_DE_CARRO.test(c.bruta) && pareceModelo(c.texto)) {
        model = c.texto;
        break;
      }
    }
  }

  // PASSADA 3: linha COM marca conhecida (maior confiabilidade)
  if (!model) {
    for (const c of candidatas.slice(0, 10)) {
      if (!pareceModelo(c.texto)) continue;
      const maiusculo = c.texto.toUpperCase();
      for (const b of BRANDS) {
        if (maiusculo.includes(b)) {
          brand = b === "VW" ? "VOLKSWAGEN" : b;
          model = c.texto;
          break;
        }
      }
      if (model) break;
    }
  }

  // PASSADA 4: a primeira linha que parece um carro. Nao achou nenhuma? O
  // regex desiste e a IA extrai -- melhor pagar o token que publicar a frase
  // do vendedor como modelo.
  if (!model) {
    const possiveis = candidatas.slice(0, 8).filter((c) => pareceModelo(c.texto));
    // 6. Entre as primeiras linhas, a que traz ficha tecnica (motorizacao,
    // ano, cambio) e o carro; a de cima costuma ser chamada de estoque.
    const ficha = (l: string) =>
      (/\b\d\.\d\b/.test(l) ? 3 : 0) +
      (/\b(19|20)\d{2}\b/.test(l) ? 2 : 0) +
      (/\b(aut\.?|autom[aá]tic[oa]|manual|mec\.?|mec[aâ]nic[oa]|cvt)\b/i.test(l) ? 2 : 0);
    const melhor = possiveis.reduce<{ texto: string; nota: number } | null>((a, c) => {
      const nota = ficha(c.texto);
      return a && a.nota >= nota ? a : { texto: c.texto, nota };
    }, null);
    // So troca quando a primeira nao tem ficha nenhuma e a outra tem bastante.
    model = melhor && melhor.nota >= 4 && ficha(possiveis[0].texto) === 0 ? melhor.texto : possiveis[0]?.texto ?? null;
  }

  // 19. A marca pode estar sozinha numa linha so dela.
  if (!brand) {
    const linhaDaMarca = candidatas.slice(0, 6).find((c) => soMarca(c.texto));
    if (linhaDaMarca) {
      const x = linhaDaMarca.texto.toUpperCase().replace(/[^A-Z\s-]/g, "").trim();
      brand = x === "VW" ? "VOLKSWAGEN" : x;
    }
  }

  if (model && !brand) {
    const maiusculo = model.toUpperCase();
    const achada = BRANDS.find((b) => maiusculo.includes(b));
    if (achada) brand = achada === "VW" ? "VOLKSWAGEN" : achada;
  }

  // --- Color ---
  let color: string | undefined;
  const colorMatch = clean.match(/\bcor\s*:?\s*([a-zA-ZÀ-ú\s]+)/i);
  if (colorMatch) color = colorMatch[1].trim();
  else {
    const colors = ["preto", "branco", "prata", "cinza", "vermelho", "azul", "verde", "dourado", "bege", "marrom"];
    for (const c of colors) {
      if (clean.toLowerCase().includes(c)) { color = c.charAt(0).toUpperCase() + c.slice(1); break; }
    }
  }

  // --- Plate ---
  let plate: string | undefined;
  const plateMatch = clean.match(/\b([A-Z]{3}\s*-?\s*\d[A-Z0-9]\d{2})\b/i);
  if (plateMatch) plate = plateMatch[1].replace(/\s/g, "").toUpperCase();

  // --- State --- (ver estados.ts). Le o texto ORIGINAL: o pino 📍 e contexto.
  const onde = detectarEstado(text);
  const state = onde.state;
  let location = onde.location;

  // --- Location (fallback se nao veio da cidade acima) ---
  if (!location) {
    const locMatch = clean.match(/\b(florian[oó]polis|porto\s*alegre|curitiba|blumenau|joinville|itaja[ií]|canoas|caxias|maring[aá]|londrina|guarapuava)\b/i);
    if (locMatch) location = locMatch[1];
  }

  // --- Phone ---
  let sellerPhone: string | undefined;
  const phoneMatch = clean.match(/\(?\d{2}\)?\s*9?\s*\d{4}[-.\s]?\d{4}/);
  if (phoneMatch) sellerPhone = phoneMatch[0];

  // --- Features (lines that are short descriptions) ---
  const features: string[] = [];
  for (const line of lines) {
    const l = line.replace(/^[✅✓☑️•\-\*]\s*/u, "").trim();
    if (!l || l.length < 3 || l.length > 60) continue;
    // Skip structural lines
    if (/^(ano|km|preco|valor|fipe|pedid|r\$|modelo|marca|\d{4})/i.test(l)) continue;
    if (l === model) continue;
    // Feature-like lines
    if (/\b(couro|teto|camera|sensor|multimidia|led|airbag|piloto|ar\s*condicionado|keyless|carplay|ipva|revisado|unico\s*dono|manual|chave|laudo|pneu)/i.test(l)) {
      features.push(l);
    }
  }

  // --- Validate minimum required fields ---
  if (!model || !year || km === null || price === null) {
    console.log("[regex] Missing fields:", { model: !!model, year: !!year, km: km !== null, price: price !== null });
    return null;
  }

  return {
    model,
    brand,
    year,
    yearModel: yearModel ?? undefined,
    km,
    price,
    fipePrice: fipePrice ?? undefined,
    transmission,
    fuel,
    color,
    plate,
    location,
    state,
    features,
    photos: [],
    rawDescription: text,
    sellerPhone,
  };
}
