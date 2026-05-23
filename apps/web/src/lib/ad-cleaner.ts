// ---------------------------------------------------------------------------
// Ad Cleaner — limpa descricoes de anuncios via GPT
// ---------------------------------------------------------------------------
// Empresas grandes (Vaapty, Repassey, etc) mandam anuncios com MUITO texto
// promocional, contatos, headers de filial -- nada que entre no padrao Cugini.
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

function hashText(s: string): string {
  return createHash("md5").update(s.trim()).digest("hex").slice(0, 16);
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

const SYSTEM_PROMPT = `Voce e um editor de anuncios de carros usados.

Sua tarefa: receber o texto de um anuncio (potencialmente bagunçado, com headers de empresa, contatos, frases promocionais) e devolver APENAS as informacoes relevantes do VEICULO no formato de bullets curtos.

REGRAS:
1. MANTER:
   - Lista de opcionais/equipamentos (multimidia, couro, sensores, etc)
   - Estado de pneus, IPVA, placa
   - Historico relevante (revisoes em concessionaria, manual, chave reserva, garantia ativa)
   - Estado do veiculo (sem detalhes, batidas, sinistro -- se mencionar)

2. REMOVER:
   - Nome da empresa/loja/grupo (ex: "VAAPTY ITAJAI", "REPASSE SUL")
   - Telefones, contatos, nomes de vendedores
   - Frases promocionais (HISTORICO PREMIUM, OPORTUNIDADE, MENOR PRECO, AVALIACAO SUPERFICIAL, "Para o seu showroom", "Acompanha manual" sem ser opcional, etc)
   - Localizacao (cidade, estado) -- ja temos no header
   - Pedida/Custo/Faco/Investimento -- ja temos no rodape
   - Modelo, ano, km, fipe -- ja temos no cabecalho
   - Emojis decorativos (manter so se for delimitador relevante)
   - Linhas vazias excessivas

3. FORMATO de saida:
   - Use uma linha por categoria de info
   - Pode usar prefixos curtos quando agregam clareza ("Opcionais:", "Estado:")
   - Mantenha o texto enxuto, no maximo 6-8 linhas
   - Se o anuncio nao tiver NADA relevante alem do que ja temos no cabecalho, devolva string vazia
   - NAO use markdown (sem *, _, ~)
   - NAO adicione informacao que nao esta no texto original

4. IDIOMA: portugues brasileiro, mesmo tom do anuncio original.

Devolva APENAS o texto limpo, sem explicacoes nem prefixo "Texto limpo:".`;

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
    cacheSet(key, cleaned);
    return cleaned;
  } catch (err) {
    console.error("[ad-cleaner] GPT failed:", err);
    // Fallback: devolve original truncado, regex do formatter cuida do resto
    return text.slice(0, 2000);
  }
}

/** Limpa o cache (util pra testes). */
export function clearCleanerCache() {
  cleanerCache.clear();
}
