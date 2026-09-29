// ---------------------------------------------------------------------------
// Ad Cleaner — limpa descricoes de anuncios via GPT
// ---------------------------------------------------------------------------
// Empresas grandes (Vaapty, Repassey, etc) mandam anuncios com MUITO texto
// promocional, contatos, headers de filial -- nada que entre no padrao Don Felipe.
//
// Regex no vehicle-formatter cobre os casos comuns, mas vira um jogo de pega-
// pega sem fim. Essa lib usa GPT pra escolher o que importa:
//   - Features/opcionais do veiculo
//   - Observacoes relevantes (revisoes, garantia, estado)
// Remove agressivamente: nome da loja, telefones, frases promocionais,
// localizacao duplicada, headers de canal de distribuicao.
//
// O modelo nao ESCREVE o anuncio: ele CITA. Cada linha que devolve vem com a
// linha do vendedor de onde saiu (`fonte`), e o codigo confere que a fonte
// existe no texto. Inventar deixa de ser regra do prompt e vira impossivel.
// Veio do primeiro dia de testes do cliente (18/09/2026): o modelo pequeno,
// com o corpo livre, copiava o exemplo do prompt e reescrevia defeito.
//
// O prompt mora em ad-cleaner-prompt.ts; o padrao de escrita, em
// corpo-do-anuncio.ts.
// ---------------------------------------------------------------------------

import OpenAI from "openai";
import { createHash } from "crypto";
import { geminiGenerateText, isGeminiConfigured } from "./gemini";
import { LIMPEZA_SCHEMA, PROMPT_VERSION, SYSTEM_PROMPT } from "./ad-cleaner-prompt";
import { NADA_PARA_FAZER, eAFazer, eObrigatoria, padronizar, padronizarLinha } from "./corpo-do-anuncio";

let _openai: OpenAI | null = null;
let _deepseek: OpenAI | null = null;

/**
 * Quem limpa o anuncio -- e de onde vem a conta.
 *
 * Esta e a chamada mais cara do sistema: roda em toda captura, com o maior
 * prompt que existe aqui (as regras de escrita do cliente) e, ate 29/09/2026,
 * no modelo mais caro. Era a maior parte da fatura sozinha.
 *
 * O DeepSeek fala a mesma API (mesma biblioteca, outro `baseURL`), e a tarefa
 * e de texto puro -- nao precisa de visao. Com `DEEPSEEK_API_KEY` no ambiente
 * a limpeza passa a rodar nele; sem ela, nada muda e segue na OpenAI.
 *
 * A diferenca que importa: o DeepSeek nao tem JSON com schema estrito, so
 * `json_object`. Aqui isso quase nao pesa, porque a conferencia de verdade
 * nunca esteve no schema e sim em `lerEConferir` -- cada item so entra se a
 * `fonte` existir LITERALMENTE no texto do vendedor.
 */
function getProvedor(): { cliente: OpenAI; modelo: string; schemaEstrito: boolean } {
  const chave = process.env.DEEPSEEK_API_KEY;
  if (chave) {
    _deepseek ??= new OpenAI({
      apiKey: chave,
      baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    });
    return {
      cliente: _deepseek,
      modelo: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      schemaEstrito: false,
    };
  }
  _openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return { cliente: _openai, modelo: MODELO, schemaEstrito: true };
}

// Cache em memoria: hash do texto -> texto limpo.
// LRU simples por timestamp -- evita recriar a mesma chamada.
type CacheEntry = { value: string; expiresAt: number };
const cleanerCache = new Map<string, CacheEntry>();
const CACHE_MAX = 500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * O modelo da OpenAI, usado quando nao ha DeepSeek configurado.
 *
 * Grande de proposito: um anuncio sao ~400 tokens, e o pequeno seguia mal as
 * 150 linhas de regra do cliente.
 */
const MODELO = "gpt-4.1";

function hashText(s: string): string {
  return createHash("md5").update(PROMPT_VERSION + ":" + s.trim()).digest("hex").slice(0, 16);
}

function cacheGet(key: string): string | null {
  const e = cleanerCache.get(key);
  if (!e) return null;
  if (e.expiresAt < Date.now()) {
    cleanerCache.delete(key);
    return null;
  }
  return e.value;
}

function cacheSet(key: string, value: string) {
  if (cleanerCache.size >= CACHE_MAX) {
    // Drop oldest 100 entries (LRU aproximado)
    const keys = Array.from(cleanerCache.keys()).slice(0, 100);
    for (const k of keys) cleanerCache.delete(k);
  }
  cleanerCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Palavras que nao provam nada sozinhas.
const PALAVRA_VAZIA = new Set([
  "para", "muito", "mais", "menos", "todo", "toda", "todos", "todas", "tudo", "nada",
  "como", "pelo", "pela", "esse", "essa", "este", "esta", "sobre", "ainda", "sempre",
  "nunca", "apenas", "somente", "carro", "veiculo", "veiculos", "fazer",
]);
const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const raizes = (s: string) =>
  (semAcento(s).toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !PALAVRA_VAZIA.has(w)).map((w) => w.slice(0, 4));

/**
 * Fica so a linha que tem raiz de palavra no texto do vendedor.
 *
 * O modelo devolveu o EXEMPLO do prompt ("Único dono, Manual do proprietário,
 * Chave reserva, IPVA pago") num Onix cujo anuncio so tinha modelo, ano, km
 * e preco. O cliente quase ofereceu o que nao existe. Raiz de 4 letras deixa
 * passar a reescrita de giria ("pneus 0" -> "Pneus novos") e barra o que
 * veio do nada.
 *
 * ponytail: reescrita sem raiz em comum ("Filé" -> "Muito conservado") cai
 * junto. Preferi perder o elogio a inventar item.
 */
export function soOQueEstaNoTexto(limpo: string, original: string): string {
  const doVendedor = new Set(raizes(original));
  const linhas = limpo.split("\n");
  const fieis = linhas.filter((linha) => {
    const r = raizes(linha);
    return r.length === 0 || r.some((x) => doVendedor.has(x));
  });
  if (fieis.length < linhas.length) {
    const fora = linhas.filter((l) => !fieis.includes(l)).join(" | ");
    console.warn(`[ad-cleaner] descartou linha que nao esta no anuncio: ${fora}`);
  }
  return fieis.join("\n").trim();
}

const ENFEITE = /^[\s*•\-–✅✓☑️]+|[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}]/gu;

// "Sem detalhes" e o item favorito da IA: aparecia sem o vendedor ter dito,
// ate em carro que "faz 1 retoque". So fica se o vendedor escreveu e nao ha
// nada a fazer na lataria.
const DIZ_SEM_DETALHES = /\b(sem|s\/|zero|nenhum)\s*detalhes?\b/i;

/**
 * A resposta da IA conferida com o vendedor: nada a mais, nada importante a
 * menos.
 *
 * O que o carro PRECISA e o que o cliente mandou replicar sempre (placa,
 * "nada para fazer", "não aparenta a km", XBri, elogio do vendedor...) volta
 * pro anuncio quando a IA deixou de fora, ja no padrao. `cobertas` sao as
 * linhas do vendedor que a IA citou; sem ela (texto solto), vale raiz de
 * palavra em comum.
 */
export function conferirComOVendedor(limpo: string, original: string, cobertas?: Set<number>): string {
  const doVendedor = original
    .split("\n")
    .map((l) => l.replace(ENFEITE, "").trim())
    .map((l) => (l && !/:\s*$/.test(l) ? padronizarLinha(l) : []));
  // "Pronto" vira "Nada para fazer": a traducao tambem conta como texto do vendedor.
  const referencia = `${original}\n${doVendedor.flat().join("\n")}`;
  let linhas = soOQueEstaNoTexto(limpo, referencia).split("\n").flatMap(padronizarLinha);

  const temRaizDe = (a: string, b: string) => raizes(a).some((r) => raizes(b).includes(r));
  const doProprioVendedor = new Set<string>();
  doVendedor.forEach((padronizadas, i) => {
    if (cobertas?.has(i)) return;
    for (const l of padronizadas) {
      if (!eAFazer(l) && !eObrigatoria(l)) continue;
      if (!cobertas) {
        // Sem citacao nao da pra confiar na reescrita do que o carro precisa
        // ("Faz 1 retoque" virou "Retoque na pintura"): vale a do vendedor.
        // A da IA sai mesmo virada em elogio ("Polimento recente").
        if (eAFazer(l)) linhas = linhas.filter((x) => doProprioVendedor.has(x) || !temRaizDe(x, l));
        else if (linhas.some((x) => temRaizDe(x, l))) continue;
      }
      if (!linhas.includes(l)) linhas.push(l);
      doProprioVendedor.add(l);
    }
  });

  const aFazer = doVendedor.flat().filter((l) => eAFazer(l) && l !== NADA_PARA_FAZER && !/^(sem|n[ãa]o\s+tem)\b/i.test(l));
  if (DIZ_SEM_DETALHES.test(original) && !aFazer.length) return linhas.join("\n");
  return linhas.filter((l) => !DIZ_SEM_DETALHES.test(l)).join("\n");
}

/** Sem enfeite, acento, negrito nem espaco duplo: e assim que fonte e texto se comparam. */
const normalizar = (s: string) =>
  semAcento(s.replace(ENFEITE, "").replace(/[*_~`]/g, "")).toLowerCase().replace(/\s+/g, " ").trim();

// Palavra curta que nao aponta pra nada ("sem manual" nao autoriza "Sem detalhes").
const PISTA_VAZIA = new Set([
  ...PALAVRA_VAZIA, "sem", "com", "por", "tem", "nao", "uma", "dos", "das", "que", "aos", "ate", "mas", "seu", "sua",
]);
/** Tres letras iniciais de cada palavra: "rev na css" e "Revisões na concessionária" se encontram. */
const pistas = (s: string) =>
  (normalizar(s).match(/[a-z]{3,}/g) ?? []).filter((w) => !PISTA_VAZIA.has(w)).map((w) => w.slice(0, 3));

/** Em que bloco a linha cai. Duas linhas de blocos diferentes: "false,true". */
const polaridade = (linhas: string[]) => [...new Set(linhas.map(eAFazer))].sort().join();

export interface Lido {
  linhas: string[];
  /** Indices das linhas do vendedor que alguma entrada aceita citou. */
  cobertas: Set<number>;
}

/**
 * Le a resposta com citacao e fica so com o que o vendedor escreveu.
 *
 * Entrada vale quando a `fonte` esta no texto do vendedor (e tem letra:
 * "2025" nao e fonte de nada) e a `saida` fala da mesma coisa -- alguma
 * palavra em comum pelas tres letras iniciais, que e o que sobra de uma
 * abreviacao como "rev na css".
 *
 * A palavra da IA so entra quando nao mexe no sentido. Fonte com traducao
 * fechada ("Faz 2 peças", "Polimento", "Pronto") sai pela traducao; saida que
 * muda de bloco -- a fazer virou feito, ou o contrario -- perde pra fonte.
 *
 * Devolve null quando a resposta nem e JSON -- ai o proximo modelo tenta.
 */
export function lerItens(raw: string, original: string): Lido | null {
  let itens: { fonte?: unknown; saida?: unknown }[];
  try {
    const j = JSON.parse(raw);
    if (!Array.isArray(j?.itens)) return null;
    itens = j.itens;
  } catch {
    return null;
  }
  const doVendedor = original.split("\n").map(normalizar);
  const linhas: string[] = [];
  const cobertas = new Set<number>();
  const recusadas: string[] = [];
  for (const item of itens) {
    const fonte = String(item.fonte ?? "");
    const f = normalizar(fonte);
    const onde = f.length >= 3 && /[a-z]{3}/.test(f) ? doVendedor.flatMap((l, i) => (l.includes(f) ? [i] : [])) : [];
    const daFonte = padronizar(fonte.replace(ENFEITE, ""));
    const pistasDaFonte = pistas(fonte);
    for (const saida of String(item.saida ?? "").split("\n").map((s) => s.trim()).filter(Boolean)) {
      const p = pistas(saida);
      const fiel = daFonte.canonica || p.length === 0 || p.some((x) => pistasDaFonte.includes(x));
      if (!onde.length || !fiel) {
        recusadas.push(`"${saida}" <- "${fonte}"`);
        continue;
      }
      const daIa = padronizarLinha(saida);
      const valem = daFonte.canonica || polaridade(daFonte.linhas) !== polaridade(daIa) ? daFonte.linhas : daIa;
      for (const l of valem) if (!linhas.includes(l)) linhas.push(l);
      onde.forEach((i) => cobertas.add(i));
    }
  }
  if (recusadas.length) console.warn(`[ad-cleaner] sem fonte no anuncio: ${recusadas.join(" | ")}`);
  return { linhas, cobertas };
}

/** Do JSON do modelo ao corpo conferido; null quando nao veio JSON. */
function lerEConferir(raw: string, original: string): string | null {
  const lido = lerItens(raw, original);
  return lido && conferirComOVendedor(lido.linhas.join("\n"), original, lido.cobertas);
}

/**
 * Limpa o rawDescription via GPT.
 * Cache de 24h por hash do texto.
 *
 * Em caso de erro (timeout, sem API key, etc), retorna o texto original
 * truncado em 2000 chars -- o formatVehicleAd ainda tem regex como
 * segunda camada de defesa.
 */
export async function cleanAdDescription(rawDescription: string): Promise<string> {
  const text = rawDescription?.trim() || "";
  if (!text) return "";
  // Texto muito curto -- nao vale a pena chamar GPT
  if (text.length < 30) return text;

  const key = hashText(text);
  const cached = cacheGet(key);
  if (cached !== null) return cached;

  // 1) O provedor de texto (primario)
  const provedor = getProvedor();
  try {
    const completion = await provedor.cliente.chat.completions.create({
      model: provedor.modelo,
      temperature: 0,
      max_tokens: 1000,
      response_format: provedor.schemaEstrito
        ? { type: "json_schema", json_schema: LIMPEZA_SCHEMA }
        : { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text.slice(0, 3000) },
      ],
    });
    // {"itens":[]} e resposta legitima: o anuncio so tinha cabecalho e rodape.
    const fiel = lerEConferir(completion.choices[0]?.message?.content || "", text);
    if (fiel !== null) {
      cacheSet(key, fiel);
      return fiel;
    }
    console.warn("[ad-cleaner] GPT nao devolveu JSON, tentando Gemini");
  } catch (err) {
    console.error("[ad-cleaner] GPT failed:", err);
  }

  // 2) Fallback: Gemini (se configurado)
  if (isGeminiConfigured()) {
    const raw = await geminiGenerateText(SYSTEM_PROMPT, text.slice(0, 3000), {
      jsonMode: true,
      maxTokens: 1000,
      temperature: 0,
    });
    const fiel = raw ? lerEConferir(raw, text) : null;
    if (fiel !== null) {
      console.log("[ad-cleaner] usado fallback Gemini com sucesso");
      cacheSet(key, fiel);
      return fiel;
    }
  }

  // 3) Ultimo fallback: texto original truncado (regex do formatter limpa o resto)
  return text.slice(0, 2000);
}

/** Limpa o cache (util pra testes). */
export function clearCleanerCache() {
  cleanerCache.clear();
}
