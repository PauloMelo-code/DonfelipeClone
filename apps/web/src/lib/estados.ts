// ---------------------------------------------------------------------------
// Estados e regioes: de onde e o carro, e se a operacao atende esse lugar.
//
// O anuncio raramente diz o estado do jeito certo. Vem como "Vitória - ES",
// "📍 Nordeste", "carro em Curitiba", "(SC)" -- ou nao vem. A leitura vai do
// mais explicito ao menos explicito, e sigla solta so conta quando nao e
// palavra comum: "ES", "SE", "TO" e "PA" aparecem em todo anuncio escrito em
// maiusculas.
//
// Regiao ("NORDESTE") vale como estado quando o anuncio so diz a regiao: o
// filtro precisa recusar o carro do Nordeste mesmo sem saber a UF.
// ---------------------------------------------------------------------------

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const REGIOES: Record<string, readonly string[]> = {
  SUL: ["RS", "SC", "PR"],
  SUDESTE: ["SP", "RJ", "MG", "ES"],
  "CENTRO-OESTE": ["GO", "MT", "MS", "DF"],
  NORDESTE: ["BA", "SE", "AL", "PE", "PB", "RN", "CE", "PI", "MA"],
  NORTE: ["AM", "PA", "AC", "RO", "RR", "AP", "TO"],
};

/**
 * Siglas que tambem sao outra coisa no anuncio: palavra ("ES", "SE", "TO"),
 * ar-condicionado ("AC"), marca ("MG"), Range Rover ("RR"), cambio ("MT"),
 * nome de loja ("GO"). So valem com contexto (pino, "cidade - UF").
 */
const SIGLAS_AMBIGUAS = new Set([
  "ES", "SE", "TO", "AL", "MA", "PA", "PI", "AM", "AC", "MG", "RR", "GO", "MT", "AP",
]);
const LISTA_UF = UFS.join("|");

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const comoPalavra = (nome: string) =>
  new RegExp(`\\b${nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);

// Por extenso e sem acento. Os mais longos primeiro: "rio grande do norte"
// nao pode virar a cidade "rio grande". "Para" (Pará) fica de fora: sem acento
// e a preposicao -- e tratado a parte, no texto original.
const NOMES: [RegExp, string][] = ([
  ["rio grande do norte", "RN"], ["rio grande do sul", "RS"], ["mato grosso do sul", "MS"],
  ["mato grosso", "MT"], ["santa catarina", "SC"], ["parana", "PR"], ["sao paulo", "SP"],
  ["rio de janeiro", "RJ"], ["minas gerais", "MG"], ["espirito santo", "ES"], ["goias", "GO"],
  ["distrito federal", "DF"], ["bahia", "BA"], ["sergipe", "SE"], ["alagoas", "AL"],
  ["pernambuco", "PE"], ["paraiba", "PB"], ["ceara", "CE"], ["piaui", "PI"], ["maranhao", "MA"],
  ["amazonas", "AM"], ["roraima", "RR"], ["rondonia", "RO"], ["amapa", "AP"], ["tocantins", "TO"],
] as [string, string][]).map(([nome, uf]) => [comoPalavra(nome), uf]);

// Cidades que aparecem em anuncio de repasse. Ficam de fora as que sao
// palavra comum ("Natal", "Palmas", "Serra", "Vitória", "Santos").
const CIDADES: [RegExp, string, string][] = ([
  // Sul
  ["florianopolis", "SC"], ["joinville", "SC"], ["blumenau", "SC"], ["itajai", "SC"],
  ["chapeco", "SC"], ["criciuma", "SC"], ["lages", "SC"], ["balneario camboriu", "SC"],
  ["camboriu", "SC"], ["jaragua do sul", "SC"], ["brusque", "SC"], ["tubarao", "SC"],
  ["palhoca", "SC"], ["sao bento do sul", "SC"], ["navegantes", "SC"], ["itapema", "SC"],
  ["concordia", "SC"], ["indaial", "SC"],
  ["porto alegre", "RS"], ["caxias do sul", "RS"], ["pelotas", "RS"], ["canoas", "RS"],
  ["santa maria", "RS"], ["gravatai", "RS"], ["novo hamburgo", "RS"], ["sao leopoldo", "RS"],
  ["passo fundo", "RS"], ["santa cruz do sul", "RS"], ["erechim", "RS"],
  ["bento goncalves", "RS"], ["lajeado", "RS"], ["viamao", "RS"], ["rio grande", "RS"],
  ["curitiba", "PR"], ["londrina", "PR"], ["maringa", "PR"], ["ponta grossa", "PR"],
  ["cascavel", "PR"], ["foz do iguacu", "PR"], ["guarapuava", "PR"],
  ["sao jose dos pinhais", "PR"], ["pato branco", "PR"], ["francisco beltrao", "PR"],
  ["umuarama", "PR"], ["apucarana", "PR"],
  // Sudeste
  ["sao jose dos campos", "SP"], ["sao jose do rio preto", "SP"], ["sao bernardo do campo", "SP"],
  ["campinas", "SP"], ["ribeirao preto", "SP"], ["sorocaba", "SP"], ["guarulhos", "SP"],
  ["osasco", "SP"], ["santo andre", "SP"], ["jundiai", "SP"], ["piracicaba", "SP"],
  ["bauru", "SP"], ["presidente prudente", "SP"], ["barueri", "SP"],
  ["niteroi", "RJ"], ["duque de caxias", "RJ"], ["nova iguacu", "RJ"], ["petropolis", "RJ"],
  ["volta redonda", "RJ"], ["campos dos goytacazes", "RJ"],
  ["belo horizonte", "MG"], ["uberlandia", "MG"], ["juiz de fora", "MG"],
  ["betim", "MG"], ["montes claros", "MG"], ["uberaba", "MG"], ["ipatinga", "MG"],
  ["vila velha", "ES"], ["cariacica", "ES"], ["guarapari", "ES"], ["linhares", "ES"],
  ["cachoeiro de itapemirim", "ES"],
  // Centro-Oeste
  ["aparecida de goiania", "GO"], ["goiania", "GO"], ["anapolis", "GO"], ["rio verde", "GO"],
  ["brasilia", "DF"], ["taguatinga", "DF"], ["cuiaba", "MT"], ["varzea grande", "MT"],
  ["rondonopolis", "MT"], ["sinop", "MT"], ["campo grande", "MS"],
  // Nordeste
  ["vitoria da conquista", "BA"], ["feira de santana", "BA"], ["salvador", "BA"],
  ["recife", "PE"], ["jaboatao", "PE"], ["caruaru", "PE"], ["petrolina", "PE"],
  ["juazeiro do norte", "CE"], ["fortaleza", "CE"], ["joao pessoa", "PB"],
  ["campina grande", "PB"], ["maceio", "AL"], ["aracaju", "SE"], ["teresina", "PI"],
  ["sao luis", "MA"], ["imperatriz", "MA"], ["mossoro", "RN"],
  // Norte
  ["belem", "PA"], ["ananindeua", "PA"], ["santarem", "PA"], ["maraba", "PA"],
  ["manaus", "AM"], ["porto velho", "RO"], ["rio branco", "AC"], ["macapa", "AP"],
  ["araguaina", "TO"],
] as [string, string][]).map(([nome, uf]) => [comoPalavra(nome), uf, nome]);

const capitalizar = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Regiao escrita no texto (ja sem acento). Sozinhas, "sul" e "norte" so valem com contexto. */
function lerRegiao(t: string, comContexto: boolean): string | undefined {
  if (/\bnordeste\b/.test(t)) return "NORDESTE";
  if (/\bsudeste\b/.test(t)) return "SUDESTE";
  if (/\bcentro[\s-]?oeste\b/.test(t)) return "CENTRO-OESTE";
  const regiao = t.match(/\bregiao\s+(norte|sul)\b/);
  if (regiao) return regiao[1].toUpperCase();
  if (comContexto) {
    if (/^\s*(regiao\s+)?norte\s*$/.test(t)) return "NORTE";
    if (/^\s*(regiao\s+)?sul\s*$/.test(t)) return "SUL";
  }
  return undefined;
}

type Achado = { state?: string; location?: string };

/** Nome por extenso, cidade ou regiao dentro de um trecho ja sem acento. */
function porNomeOuCidade(t: string, original: string): Achado {
  for (const [rx, uf] of NOMES) if (rx.test(t)) return { state: uf };
  if (/\bPar[áÁ]\b/.test(original)) return { state: "PA" };
  for (const [rx, uf, nome] of CIDADES) if (rx.test(t)) return { state: uf, location: capitalizar(nome) };
  return {};
}

/**
 * Um trecho que JA se sabe ser de localizacao (depois do pino, de "Local:").
 * Aqui a sigla vale mesmo em minuscula e mesmo sendo ambigua.
 */
function lerTrechoDeLocal(trecho: string): Achado {
  const t = semAcento(trecho);
  const achado = porNomeOuCidade(t, trecho);
  const sigla = trecho.match(new RegExp(`\\b(${LISTA_UF})\\b`, "i"));
  if (sigla) return { state: sigla[1].toUpperCase(), location: achado.location };
  if (achado.state) return achado;
  const regiao = lerRegiao(t, true);
  return regiao ? { state: regiao } : {};
}

const CONTEXTO_DE_LOCAL =
  /^\s*(?:local(?:iza[çc][ãa]o)?|cidade|estado|uf|origem|regi[ãa]o|p[aá]tio|carro\s+em|carro\s+est[aá]\s+em|localizad[oa]\s+em|est[aá]\s+em)\s*[:\-–]?\s*(.+)$/i;

/**
 * O estado do carro segundo o anuncio, do mais confiavel ao menos:
 *  1. trecho marcado como local: pino, "Local:", "Cidade:", "carro em ..."
 *  2. "Cidade - UF", "Cidade/UF", "(UF)"
 *  3. estado por extenso
 *  4. regiao ("Nordeste")
 *  5. cidade conhecida
 *  6. "placa SC", "emplacado PR"
 *  7. sigla solta em maiusculas, so as que nao sao palavra comum
 */
export function detectarEstado(texto: string): Achado {
  if (!texto) return {};
  const linhas = texto.split("\n");

  // 1. Trecho marcado como localizacao.
  for (const linha of linhas) {
    const pino = linha.split("📍")[1];
    const marcado = pino ?? linha.match(CONTEXTO_DE_LOCAL)?.[1];
    if (!marcado) continue;
    const achado = lerTrechoDeLocal(marcado);
    if (achado.state) return achado;
  }

  // 2. "Vitória - ES", "Curitiba/PR", "(SC)". Sigla em maiuscula.
  const cidadeUf = texto.match(
    new RegExp(`[A-Za-zÀ-ú]{3,}(?:[ \\t]+[A-Za-zÀ-ú]+){0,3}[ \\t]*[-/–][ \\t]*(${LISTA_UF})\\b`)
  );
  if (cidadeUf) return { state: cidadeUf[1] };
  const entreParenteses = texto.match(new RegExp(`\\((${LISTA_UF})\\)`));
  if (entreParenteses) return { state: entreParenteses[1] };

  // 3 a 5. Por extenso, regiao, cidade.
  const t = semAcento(texto);
  for (const [rx, uf] of NOMES) if (rx.test(t)) return { state: uf };
  if (/\bPar[áÁ]\b/.test(texto)) return { state: "PA" };
  const regiao = lerRegiao(t, false);
  if (regiao) return { state: regiao };
  for (const [rx, uf, nome] of CIDADES) if (rx.test(t)) return { state: uf, location: capitalizar(nome) };

  // 6. Placa.
  const placa = texto.match(new RegExp(`\\b(?:emplacad[oa]|placa\\s*(?:de|do)?)\\s+(${LISTA_UF})\\b`, "i"));
  if (placa) {
    const uf = placa[1].toUpperCase();
    if (!SIGLAS_AMBIGUAS.has(uf) || placa[1] === uf) return { state: uf };
  }

  // 7. Sigla solta, maiuscula e nao ambigua. Seguida de numero e modelo
  // ("RS 3", "RS 6" da Audi), nao estado.
  const soltas = UFS.filter((uf) => !SIGLAS_AMBIGUAS.has(uf)).join("|");
  const solta = texto.match(new RegExp(`\\b(${soltas})\\b(?![ \\t-]*\\d)`));
  if (solta) return { state: solta[1] };

  return {};
}

/**
 * Leva qualquer forma de estado para UF ou nome de regiao: "sc" -> "SC",
 * "Espírito Santo" -> "ES", "Nordeste" -> "NORDESTE". O resto vira null.
 */
export function normalizarEstado(valor: string | null | undefined): string | null {
  if (!valor || !valor.trim()) return null;
  const maiusculo = valor.trim().toUpperCase();
  if ((UFS as readonly string[]).includes(maiusculo)) return maiusculo;
  const regiao = maiusculo.replace(/\s+/g, "-");
  if (regiao in REGIOES) return regiao;
  return lerTrechoDeLocal(valor).state ?? null;
}

/** As UFs que um estado ou regiao cobre. */
export function ufsDe(estado: string): readonly string[] {
  return REGIOES[estado] ?? [estado];
}

/**
 * O lugar e atendido? Regiao so e atendida se TODAS as UFs dela forem:
 * "Sudeste" com so SP atendido pode ser RJ, e fica de fora.
 */
export function estadoAtendido(estado: string, atendidos: readonly string[]): boolean {
  const normalizado = normalizarEstado(estado);
  if (!normalizado) return false;
  return ufsDe(normalizado).every((uf) => atendidos.includes(uf));
}
