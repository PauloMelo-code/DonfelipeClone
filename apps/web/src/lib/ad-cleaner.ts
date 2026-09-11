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
const PROMPT_VERSION = "v4";

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
  Sem detalhes
  Pneus novos

EXEMPLO 2 (BMW i7):
  Blindada SBA
  Vidros protector EVO
  Único dono
  Manual do proprietário
  Chave reserva
  IPVA 2026 pago
  Sem detalhes

EXEMPLO 3 (Sportage 2021):
  Ar condicionado
  Direção hidráulica
  Manual e chave reserva
  Pneus bons
  Motor, suspensão e caixa OK
  Revisado na concessionária
  Único dono

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

5. PLACA: so incluir se realmente houver placa valida (ABC1D23 ou
   ABC-1234). NAO escrever "Placa: i" ou "Placa a confirmar" se nao
   tiver placa real -- omita a linha.

6. SAIDA:
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
      cacheSet(key, cleaned);
      return cleaned;
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
      cacheSet(key, cleaned);
      return cleaned;
    }
  }

  // 3) Ultimo fallback: texto original truncado (regex do formatter limpa o resto)
  return text.slice(0, 2000);
}

/** Limpa o cache (util pra testes). */
export function clearCleanerCache() {
  cleanerCache.clear();
}
