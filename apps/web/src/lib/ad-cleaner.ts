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
// ---------------------------------------------------------------------------

import OpenAI from "openai";
import { createHash } from "crypto";
import { geminiGenerateText, isGeminiConfigured } from "./gemini";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// Cache em memoria: hash do texto -> texto limpo.
// LRU simples por timestamp -- evita recriar a mesma chamada.
type CacheEntry = { value: string; expiresAt: number };
const cleanerCache = new Map<string, CacheEntry>();
const CACHE_MAX = 500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Bump esse prefixo quando mudar o SYSTEM_PROMPT pra invalidar cache antigo.
const PROMPT_VERSION = "v7";

/** Modelo grande de proposito: um anuncio sao ~400 tokens, e o pequeno seguia mal 150 linhas de regra. */
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

const SYSTEM_PROMPT = `Voce e um editor de anuncios de carros usados no padrao Don Felipe.

Tarefa: receber o texto bagunçado do vendedor e ESCOLHER as linhas que
entram no corpo do anuncio, devolvendo cada uma com a linha de origem.
Voce nao escreve o anuncio: voce cita o vendedor e arruma a forma. O
sistema ja adiciona cabecalho (marca/modelo/ano/km) e rodape (Fipe/Por)
automaticamente -- voce so cuida do MIOLO.

=== PADRAO DON FELIPE (CRITICO -- SEGUIR 100%) ===
Cada informacao em LINHA SEPARADA. SEM prefixos com dois pontos
(NAO USAR "Opcionais:", "Estado:", "Placa:", "Revisoes:", "Historico:").
Apenas listar os fatos diretamente, frases curtas e diretas.

EXEMPLO (texto do vendedor -> resposta):

  SPORTAGE 2021 EX
  2021/2022 - 40 mil km
  ✅ ar cond, dir hidr
  ✅ ipva 26 pg
  ✅ pneus 0
  manual e chave reserva
  motor susp caixa ok
  rev na css, 1 dono
  Faz 1 retoque
  Fipe 140 / Por 128
  Chama no whats 51 9999-9999

  {"itens":[
    {"fonte":"ar cond, dir hidr","saida":"Ar condicionado, direção hidráulica"},
    {"fonte":"ipva 26 pg","saida":"IPVA 2026 pago"},
    {"fonte":"pneus 0","saida":"Pneus novos"},
    {"fonte":"manual e chave reserva","saida":"Manual e chave reserva"},
    {"fonte":"motor susp caixa ok","saida":"Motor, suspensão e caixa OK"},
    {"fonte":"rev na css, 1 dono","saida":"Revisado na concessionária, único dono"},
    {"fonte":"Faz 1 retoque","saida":"Faz 1 retoque"}
  ]}

O exemplo mostra o FORMATO. Nunca copie um item dele: cada entrada da sua
resposta vem de uma linha do texto recebido. Se o texto so traz modelo,
ano, km e preco, a resposta e {"itens":[]}.

=== REGRAS ===
1. SEM prefixos categorizadores. NUNCA escrever "Opcionais:", "Estado:",
   "Histórico:", "Placa:". Apenas o conteúdo direto.

2. Cada fato em UMA linha curta. Pode juntar coisas relacionadas com
   virgula quando ficar natural ("Motor, suspensão e caixa OK").
   Mas NAO USE bullets, asteriscos, hifens decorativos.

3. NORMALIZAR capitalizacao: primeira letra maiuscula, resto minuscula
   (a menos que seja sigla ou nome proprio):
   ERRADO: "AR CONDICIONADO" / "PNEUS BONS"
   CERTO:  "Ar condicionado" / "Pneus bons"

4. REMOVER:
   - Nome da loja/empresa (VAAPTY, REPASSE SUL, GO REPASSES, CAARPIX,
     <NOME> PORTO ALEGRE, etc)
   - Telefones, contatos, nomes de vendedores (Lucas, Junior, etc)
   - Chamadas promocionais (Menor valor Brasil, Oportunidade,
     Historico Premium, Avaliacao Superficial, "Para o seu showroom",
     "Acompanha manual e chave reserva" -- se isolado e marketing)
   - Localizacao (cidade, estado) -- ja temos no header
   - Pedida/Custo/Faco/Investimento/Valor/Fipe -- ja temos no rodape
   - Modelo, ano, km -- ja temos no cabecalho
   - Emojis e simbolos decorativos
   - Linhas vazias excessivas

5. LINGUAGEM: reescreva girias, abreviacoes e erros em portugues claro e
   profissional, SEM inventar informacao. Frase que nao diz nada sobre o
   carro ("chama", "bora", "carro bom demais") sai.
   ERRADO: "Filé" / "rev na css" / "pneus 0" / "ipva 26 pg" / "sem retoq"
   CERTO:  "Muito conservado" / "Revisões na concessionária" /
           "Pneus novos" / "IPVA 2026 pago" / "Sem retoques"
   "Manual e chave cópia" e "Manual do proprietário" sao itens e ficam.

5a. DEFEITO E GASTO SEMPRE FICAM, COM A PALAVRA DO VENDEDOR: o que o
   carro PRECISA (polimento, pintar peca, retoque, amassado, risco, "so
   polir e higienizar") e a informacao mais importante do anuncio. Copie
   a linha do vendedor, so tirando enfeite -- reescrever muda o sentido.
   Precisou cortar pelo limite de linhas? Corte opcional, nunca defeito.
   "Gastos necessários: * Polimento" -> "Polimento"

5b. PECA E RETOQUE: no repasse, "peca" e peca PINTADA e "faz 1 retoque" e
   um retoque A FAZER. Nesses, "saida" = "fonte" (o sistema traduz).
   NUNCA "substituir", "substituída", "trocada".
   NUNCA "retoque na pintura" -- isso diz que o carro TEM retoque, e outra
   informacao.

5c. "SEM DETALHES" SO SE O VENDEDOR ESCREVEU. Nunca em carro que tem
   retoque, peca ou polimento a fazer -- isso E detalhe. "Zero de andar"
   e mecanica, nao lataria.

6. PLACA: so incluir se realmente houver placa valida (ABC1D23 ou
   ABC-1234). NAO escrever "Placa: i" ou "Placa a confirmar" se nao
   tiver placa real -- omita a linha.

=== FORMATO DA RESPOSTA (JSON) ===
{"itens":[{"fonte":"...","saida":"..."}, ...]}
- "fonte": a linha do vendedor COPIADA como esta no texto (pode ser um
  trecho da linha). Sem corrigir, sem juntar linhas, sem completar. Se a
  informacao nao esta escrita, a entrada nao existe.
- "saida": a mesma informacao no padrao Don Felipe -- capitalizacao,
  giria em portugues claro, sem enfeite. Nao diz nada que a fonte nao diga.
- Uma entrada por linha do anuncio, na ordem do texto. Maximo 7.
- Sem markdown na saida (sem *, _, ~, #, :, -). Portugues brasileiro.
- Nada util alem do cabecalho/rodape: {"itens":[]}
Responda SO o JSON.`;

const LIMPEZA_SCHEMA = {
  name: "anuncio_limpo",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      itens: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: { fonte: { type: "string" as const }, saida: { type: "string" as const } },
          required: ["fonte", "saida"],
          additionalProperties: false,
        },
      },
    },
    required: ["itens"],
    additionalProperties: false,
  },
};

// Palavras que nao provam nada sozinhas.
const PALAVRA_VAZIA = new Set([
  "para", "muito", "mais", "menos", "todo", "toda", "todos", "todas", "tudo", "nada",
  "como", "pelo", "pela", "esse", "essa", "este", "esta", "sobre", "ainda", "sempre",
  "nunca", "apenas", "somente", "carro", "veiculo", "veiculos",
]);
const raizes = (s: string) =>
  (s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z]{4,}/g) ?? [])
    .filter((w) => !PALAVRA_VAZIA.has(w))
    .map((w) => w.slice(0, 4));

/**
 * Fica so a linha que tem raiz de palavra no texto do vendedor.
 *
 * O modelo devolveu o EXEMPLO do prompt ("Único dono, Manual do proprietário,
 * Chave reserva, IPVA pago") num Onix cujo anuncio so tinha modelo, ano, km
 * e preco. O cliente quase ofereceu o que nao existe. Raiz de 4 letras deixa
 * passar a reescrita de giria ("ipva 26 pg" -> "IPVA 2026 pago", "pneus 0"
 * -> "Pneus novos") e barra o que veio do nada.
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

// O que o carro PRECISA: e o que o comprador de repasse mais quer saber.
const DEFEITO =
  /\b(polimento|polir|pintar|pe[çc]as?|retoques?|amassad\w*|risc(?:o|os|ad\w*)|batid\w*|trinca\w*|arranh\w*|avaria\w*|defeito\w*|reparo\w*|conserto\w*|higieniz\w*)\b/i;
const ENFEITE = /^[\s*•\-–✅✓☑️]+|[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}]/gu;

/**
 * Defeito e com a palavra do vendedor, nunca com a da IA.
 *
 * "Gastos necessários: * Polimento" sumiu do anuncio da Commander, e "Faz 1
 * retoque" virou "Retoque na pintura" -- que diz que o carro TEM retoque, o
 * contrario. A linha da IA sobre o mesmo defeito sai; a do vendedor entra
 * no fim, so sem enfeite. O formatador traduz "1x peças" e "faz 1 retoque"
 * para "Pintar uma peça" depois.
 */
const NEGADO = /^(sem|s\/|zero|nenhum)\b/i;
const linhasDeDefeito = (original: string) =>
  original
    .split("\n")
    .map((l) => l.replace(ENFEITE, "").trim())
    .filter((l) => l && DEFEITO.test(l) && !NEGADO.test(l) && !/:\s*$/.test(l))
    .map((l) => l.charAt(0).toUpperCase() + l.slice(1));

export function garantirDefeitos(limpo: string, original: string): string {
  const doVendedor = linhasDeDefeito(original);
  if (!doVendedor.length) return limpo;
  const raizesDoVendedor = new Set(doVendedor.flatMap(raizes));
  const daIa = limpo
    .split("\n")
    .filter((l) => !(DEFEITO.test(l) && raizes(l).some((r) => raizesDoVendedor.has(r))));
  return [...daIa, ...doVendedor].filter(Boolean).join("\n");
}

// "Sem detalhes" e o item favorito da IA: aparecia sem o vendedor ter dito,
// ate em carro que "faz 1 retoque". So fica se o vendedor escreveu e nao ha
// defeito a fazer.
const DIZ_SEM_DETALHES = /\b(sem|s\/|zero|nenhum)\s*detalhes?\b/i;

/** A resposta da IA conferida com o vendedor: nada a mais, nenhum defeito a menos. */
export function conferirComOVendedor(limpo: string, original: string): string {
  const fiel = garantirDefeitos(soOQueEstaNoTexto(limpo, original), original);
  if (DIZ_SEM_DETALHES.test(original) && !linhasDeDefeito(original).length) return fiel;
  return fiel.split("\n").filter((l) => !DIZ_SEM_DETALHES.test(l)).join("\n");
}

/** Sem enfeite, acento, negrito nem espaco duplo: e assim que fonte e texto se comparam. */
const normalizar = (s: string) =>
  s.replace(ENFEITE, "").replace(/[*_~`]/g, "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

// Palavra curta que nao aponta pra nada ("sem manual" nao autoriza "Sem detalhes").
const PISTA_VAZIA = new Set([
  ...PALAVRA_VAZIA, "sem", "com", "por", "tem", "nao", "uma", "dos", "das", "que", "aos", "ate", "mas", "seu", "sua",
]);
/** Tres letras iniciais de cada palavra: "rev na css" e "Revisões na concessionária" se encontram. */
const pistas = (s: string) =>
  (normalizar(s).match(/[a-z]{3,}/g) ?? []).filter((w) => !PISTA_VAZIA.has(w)).map((w) => w.slice(0, 3));

/**
 * Le a resposta com citacao e fica so com o que o vendedor escreveu.
 *
 * Entrada vale quando a `fonte` esta no texto do vendedor (e tem letra:
 * "2025" nao e fonte de nada) e a `saida` fala da mesma coisa -- alguma
 * palavra em comum pelas tres letras iniciais, que e o que sobra de uma
 * abreviacao como "rev na css".
 *
 * Devolve null quando a resposta nem e JSON -- ai o proximo modelo tenta.
 */
export function lerItens(raw: string, original: string): string | null {
  let itens: { fonte?: unknown; saida?: unknown }[];
  try {
    const j = JSON.parse(raw);
    if (!Array.isArray(j?.itens)) return null;
    itens = j.itens;
  } catch {
    return null;
  }
  const doVendedor = original.split("\n").map(normalizar).filter((l) => l.length >= 3);
  const validas: string[] = [];
  const recusadas: string[] = [];
  for (const item of itens) {
    const fonte = String(item.fonte ?? "");
    const f = normalizar(fonte);
    const citada = f.length >= 3 && /[a-z]{3}/.test(f) && doVendedor.some((l) => l.includes(f));
    const pistasDaFonte = pistas(fonte);
    for (const saida of String(item.saida ?? "").split("\n").map((s) => s.trim()).filter(Boolean)) {
      const p = pistas(saida);
      const fiel = p.length === 0 || p.some((x) => pistasDaFonte.includes(x));
      if (citada && fiel) validas.push(saida);
      else recusadas.push(`"${saida}" <- "${fonte}"`);
    }
  }
  if (recusadas.length) console.warn(`[ad-cleaner] sem fonte no anuncio: ${recusadas.join(" | ")}`);
  return validas.join("\n");
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

  // 1) GPT (primario)
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: MODELO,
      temperature: 0,
      max_tokens: 800,
      response_format: { type: "json_schema", json_schema: LIMPEZA_SCHEMA },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text.slice(0, 3000) },
      ],
    });
    const lido = lerItens(completion.choices[0]?.message?.content || "", text);
    // {"itens":[]} e resposta legitima: o anuncio so tinha cabecalho e rodape.
    if (lido !== null) {
      const fiel = conferirComOVendedor(lido, text);
      cacheSet(key, fiel);
      return fiel;
    }
    console.warn("[ad-cleaner] GPT nao devolveu JSON, tentando Gemini");
  } catch (err) {
    console.error("[ad-cleaner] GPT failed:", err);
  }

  // 2) Fallback: Gemini 2.0 Flash (se configurado)
  if (isGeminiConfigured()) {
    const raw = await geminiGenerateText(SYSTEM_PROMPT, text.slice(0, 3000), {
      jsonMode: true,
      maxTokens: 800,
      temperature: 0,
    });
    const lido = raw ? lerItens(raw, text) : null;
    if (lido !== null) {
      console.log("[ad-cleaner] usado fallback Gemini com sucesso");
      const fiel = conferirComOVendedor(lido, text);
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
