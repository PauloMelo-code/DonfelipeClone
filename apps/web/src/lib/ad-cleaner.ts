// ---------------------------------------------------------------------------
// Ad Cleaner — limpa descricoes de anuncios via GPT
// ---------------------------------------------------------------------------
// Empresas grandes (Vaapty, Repassey, etc) mandam anuncios com MUITO texto
// promocional, contatos, headers de filial -- nada que entre no padrao Don Felipe.
//
// Regex no vehicle-formatter cobre os casos comuns, mas vira um jogo de pega-
// pega sem fim. Essa lib usa GPT-4.1-mini pra extrair apenas o que importa:
//   - Features/opcionais do veiculo
//   - Observacoes relevantes (revisoes, garantia, estado)
// Remove agressivamente: nome da loja, telefones, frases promocionais,
// localizacao duplicada, headers de canal de distribuicao.
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
const PROMPT_VERSION = "v6";

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

Tarefa: receber o texto bagunçado e devolver APENAS o CORPO limpo do
anuncio. O sistema ja adiciona cabecalho (marca/modelo/ano/km) e rodape
(Fipe/Por) automaticamente -- voce so cuida do MIOLO.

=== PADRAO DON FELIPE (CRITICO -- SEGUIR 100%) ===
Cada informacao em LINHA SEPARADA. SEM prefixos com dois pontos
(NAO USAR "Opcionais:", "Estado:", "Placa:", "Revisoes:", "Historico:").
Apenas listar os fatos diretamente, frases curtas e diretas.

EXEMPLOS DO PADRAO CORRETO:

EXEMPLO 1 (Audi A6):
  Blindado
  Revisado
  Pneus novos

EXEMPLO 2 (BMW i7):
  Blindada SBA
  Vidros protector EVO
  Único dono
  Manual do proprietário
  Chave reserva
  IPVA 2026 pago
  Bancos ventilados

EXEMPLO 3 (Sportage 2021):
  Ar condicionado
  Direção hidráulica
  Manual e chave reserva
  Pneus bons
  Motor, suspensão e caixa OK
  Revisado na concessionária
  Único dono

Os exemplos acima mostram so o FORMATO. NUNCA copie um item deles: cada
linha da sua resposta tem que vir de algo ESCRITO no texto recebido. Se o
texto so traz modelo, ano, km e preco, a resposta e vazia.

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
   um retoque A FAZER. "1x pecas", "2 pecas", "uma peca", "faz 1 retoque"
   -> "Pintar uma peça" / "Pintar duas peças".
   NUNCA "substituir", "substituída", "trocada".
   NUNCA "retoque na pintura" -- isso diz que o carro TEM retoque, e outra
   informacao.

5c. "SEM DETALHES" SO SE O VENDEDOR ESCREVEU. Nunca em carro que tem
   retoque, peca ou polimento a fazer -- isso E detalhe. "Zero de andar"
   e mecanica, nao lataria.

6. PLACA: so incluir se realmente houver placa valida (ABC1D23 ou
   ABC-1234). NAO escrever "Placa: i" ou "Placa a confirmar" se nao
   tiver placa real -- omita a linha.

7. SAIDA:
   - Maximo 7 linhas
   - SEM linhas em branco no meio (linhas devem ser CONSECUTIVAS, sem
     espacos entre elas -- o template ja cuida do espacamento global)
   - Se nao tiver NADA util alem do que ja esta no cabecalho/rodape,
     devolva string vazia ""
   - SEM markdown (sem *, _, ~, #, :, -)
   - portugues brasileiro

ESPACAMENTO (CRITICO):
O sistema adiciona automaticamente:
   <cabecalho>
   <linha em branco>
   <SEU CORPO AQUI>           <- consecutivo, sem brancas internas
   <linha em branco>
   <rodape>
Entao VOCE deve devolver SO o corpo, sem linhas em branco entre os itens.

Devolva APENAS o corpo limpo. SEM explicacoes, SEM prefixo "Texto limpo:",
SEM aspas envolvendo a resposta.`;

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

/**
 * Limpa o rawDescription via GPT-4.1-mini.
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

  // 1) Tenta GPT-4.1-mini (primario)
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.1,
      max_tokens: 400,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text.slice(0, 3000) },
      ],
    });
    const cleaned = (completion.choices[0]?.message?.content || "").trim();
    if (cleaned) {
      const fiel = conferirComOVendedor(cleaned, text);
      cacheSet(key, fiel);
      return fiel;
    }
    // GPT retornou vazio -- considera falha, cai pro fallback
    console.warn("[ad-cleaner] GPT retornou vazio, tentando Gemini");
  } catch (err) {
    console.error("[ad-cleaner] GPT failed:", err);
  }

  // 2) Fallback: Gemini 2.0 Flash (se configurado)
  if (isGeminiConfigured()) {
    const cleaned = await geminiGenerateText(SYSTEM_PROMPT, text.slice(0, 3000), {
      maxTokens: 400,
      temperature: 0.1,
    });
    if (cleaned) {
      console.log("[ad-cleaner] usado fallback Gemini com sucesso");
      const fiel = conferirComOVendedor(cleaned, text);
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
