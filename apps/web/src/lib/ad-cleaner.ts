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

// Bump esse prefixo quando mudar o SYSTEM_PROMPT pra invalidar cache antigo.
const PROMPT_VERSION = "v2";

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

const SYSTEM_PROMPT = `Voce e um editor de anuncios de carros usados no padrao Cugini.

Tarefa: receber o texto bagunçado e devolver APENAS as informacoes do
VEICULO no FORMATO PADRAO Cugini abaixo.

=== FORMATO PADRAO (CRITICO) ===
Devolva no MAXIMO 5-6 linhas seguindo essa estrutura quando aplicavel:

  Opcionais: <item1>, <item2>, <item3>, ...
  <Atributo curto isolado: ex "Único dono">
  Manual e chave reserva
  IPVA <ano> pago
  Estado: <pneus bons, sem detalhes, etc>
  Historico: <revisoes em concessionaria, etc>

REGRAS:
1. AGRUPAR opcionais EM UMA LINHA SO com prefixo "Opcionais: " separado
   por virgula. NAO listar cada um numa linha.
   ERRADO:
     Blindada SBA
     Vidros protector
     Multimidia
   CERTO:
     Opcionais: blindada SBA, vidros protector, multimidia

2. Atributos "individuais" continuam em linha propria (sao status, nao opcional):
   - "Único dono", "Manual do proprietário", "Chave reserva"
   - "IPVA <ano> pago", "Placa a confirmar"
   - "Sem detalhes"
   Estes ficam em linhas separadas, podem ate agrupar com " · " se ficar bom:
     Único dono · Manual e chave reserva

3. REMOVER:
   - Nome da loja/empresa/grupo (VAAPTY, REPASSE SUL, GO REPASSES, etc)
   - Telefones, contatos, nomes de vendedores (Lucas, Junior, etc)
   - Frases promocionais (Menor valor Brasil, Oportunidade, Historico Premium,
     Avaliacao Superficial, "Para o seu showroom", etc)
   - Localizacao (cidade, estado) -- ja temos no header
   - Pedida/Custo/Faco/Investimento/Valor -- ja temos no rodape
   - Modelo, ano, km, fipe -- ja temos no cabecalho
   - Emojis decorativos
   - Linhas vazias excessivas

4. SAIDA:
   - Maximo 5-6 linhas
   - Se nao tiver NADA relevante alem do que ja temos no cabecalho, devolva ""
   - NAO use markdown (sem *, _, ~, #)
   - NAO adicione informacao que nao esta no texto original
   - portugues brasileiro, sem palavras em maiusculas excessivas

=== EXEMPLOS ===
INPUT:
  Menor valor Brasil
  BMW i7
  Ano 2024
  39.000 km
  *Blindada SBA vidros protector evo*
  Único dono
  Manual do proprietário
  Chave reserva
  Sem detalhes
  IPVA 2026 pago
  Fipe R\$ 882.373,00
  Valor R\$ 679.990,00
  *Contatos Go Repasses Porto Alegre*
  *Lucas* | 51997361089
  *Júnior* | 51996811106

OUTPUT (sem cabecalho/rodape -- so o corpo limpo):
  Opcionais: blindada SBA, vidros protector EVO
  Único dono · Manual do proprietário · Chave reserva
  IPVA 2026 pago
  Sem detalhes

Devolva APENAS o corpo limpo. Sem explicacoes, sem prefixo "Texto limpo:".`;

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
