import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Politica de senha — um modulo, uma implementacao.
//
// Roda em TODO caminho que GRAVA senha (cadastro, troca, senha definida por
// admin, seed) e em NENHUM que so confere (login, verificacao). Pendurar
// politica no login transforma a resposta em oraculo e reprova quem ja tem
// senha antiga valida.
//
// Regua: NIST SP 800-63B-4 (jul/2025) e OWASP ASVS 5.0.
//  - comprimento e a unica exigencia que importa;
//  - SEM regras de composicao (maiuscula/numero/simbolo) — a norma proibe;
//  - SEM expiracao periodica — a norma proibe;
//  - blocklist de senhas vazadas e obrigatoria, com fail-open e aviso.
// ---------------------------------------------------------------------------

/**
 * Piso enquanto a senha for FATOR UNICO (nao ha segundo fator no sistema).
 * Quando o segundo fator entrar (Fase 4 do plano), cai para 8.
 */
export const TAMANHO_MINIMO = 15;

/** Teto por custo de KDF. Acima disso nao aumenta seguranca, so CPU. */
export const TAMANHO_MAXIMO = 64;

/**
 * Teto BRUTO conferido antes de qualquer normalizacao, hash ou consulta.
 * Sem ele, um corpo de 4 MB vira trabalho de KDF e derruba o processo.
 */
export const TAMANHO_MAXIMO_BRUTO = 200;

/** bcrypt ignora tudo depois do byte 72, em silencio. */
const BCRYPT_MAX_BYTES = 72;

const TERMOS_DO_PRODUTO = ["donfelipe", "don felipe", "repasse", "repasses", "veiculo", "carro"];

export interface ResultadoPolitica {
  ok: boolean;
  /** Motivos de recusa, prontos para exibir item a item na tela. */
  erros: string[];
  /** Nao impedem a gravacao. Ex.: blocklist indisponivel. */
  avisos: string[];
}

export interface ContextoSenha {
  nome?: string | null;
  email?: string | null;
}

/**
 * Quebra o texto em pedacos com significado (>= 4 chars) para comparar com a
 * senha. "Paulo Vitor" vira ["paulo","vitor"]; "joao@donfelipe.com.br" vira
 * ["joao","donfelipe","com"].
 */
function termosDoContexto(contexto: ContextoSenha): string[] {
  const bruto = [contexto.nome ?? "", (contexto.email ?? "").replace(/@/g, " ")].join(" ");
  return bruto
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
}

/** Sequencia de teclado ou de alfabeto com 4+ caracteres seguidos. */
function temSequencia(senha: string): boolean {
  const s = senha.toLowerCase();
  const trilhas = ["abcdefghijklmnopqrstuvwxyz", "0123456789", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
  for (const trilha of trilhas) {
    for (let i = 0; i + 4 <= trilha.length; i++) {
      const pedaco = trilha.slice(i, i + 4);
      if (s.includes(pedaco) || s.includes([...pedaco].reverse().join(""))) return true;
    }
  }
  return false;
}

/** Mesmo caractere 4+ vezes seguidas. */
function temRepeticao(senha: string): boolean {
  return /(.)\1{3,}/.test(senha);
}

/**
 * Consulta a lista de senhas vazadas do Have I Been Pwned por k-anonimato:
 * so os 5 primeiros caracteres do SHA-1 saem daqui, nunca a senha.
 *
 * FAIL-OPEN por decisao: HIBP fora do ar nao pode impedir alguem de criar
 * conta. Devolve `null` quando nao deu para consultar, e quem chama vira isso
 * em aviso, nao em erro.
 */
async function contagemDeVazamentos(senha: string): Promise<number | null> {
  try {
    const sha1 = createHash("sha1").update(senha, "utf8").digest("hex").toUpperCase();
    const prefixo = sha1.slice(0, 5);
    const sufixo = sha1.slice(5);

    const resposta = await fetch(`https://api.pwnedpasswords.com/range/${prefixo}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(3000),
    });
    if (!resposta.ok) return null;

    const corpo = await resposta.text();
    for (const linha of corpo.split("\n")) {
      const [suf, qtd] = linha.trim().split(":");
      if (suf === sufixo) return parseInt(qtd, 10) || 0;
    }
    return 0;
  } catch {
    return null;
  }
}

/**
 * Aplica a politica inteira. A ordem importa: o teto bruto vem antes de
 * qualquer trabalho caro (hash, rede).
 */
export async function validarSenha(
  senha: unknown,
  contexto: ContextoSenha = {}
): Promise<ResultadoPolitica> {
  const erros: string[] = [];
  const avisos: string[] = [];

  if (typeof senha !== "string" || senha.length === 0) {
    return { ok: false, erros: ["Senha e obrigatoria."], avisos };
  }

  // Teto bruto ANTES de normalizar, hashear ou consultar rede.
  if (senha.length > TAMANHO_MAXIMO_BRUTO) {
    return {
      ok: false,
      erros: [`Senha excede o limite de ${TAMANHO_MAXIMO_BRUTO} caracteres.`],
      avisos,
    };
  }

  if (senha.length < TAMANHO_MINIMO) {
    erros.push(`Use ao menos ${TAMANHO_MINIMO} caracteres. Uma frase e mais facil e mais forte que uma palavra com simbolos.`);
  }
  if (senha.length > TAMANHO_MAXIMO) {
    erros.push(`Use no maximo ${TAMANHO_MAXIMO} caracteres.`);
  }
  if (Buffer.byteLength(senha, "utf8") > BCRYPT_MAX_BYTES) {
    erros.push(`Senha longa demais para o algoritmo de hash (limite de ${BCRYPT_MAX_BYTES} bytes). Use menos caracteres acentuados ou emojis.`);
  }

  const minuscula = senha.toLowerCase();
  const contextuais = [...termosDoContexto(contexto), ...TERMOS_DO_PRODUTO];
  if (contextuais.some((t) => minuscula.includes(t))) {
    erros.push("A senha nao pode conter seu nome, seu e-mail ou o nome do sistema.");
  }
  if (temSequencia(senha)) {
    erros.push("A senha nao pode conter sequencias como 'abcd', '1234' ou 'qwerty'.");
  }
  if (temRepeticao(senha)) {
    erros.push("A senha nao pode repetir o mesmo caractere quatro vezes seguidas.");
  }

  // So consulta a rede se o resto passou — nao vale gastar 3 s numa senha de
  // 3 caracteres que ja foi reprovada.
  if (erros.length === 0) {
    const vazamentos = await contagemDeVazamentos(senha);
    if (vazamentos === null) {
      avisos.push("Nao foi possivel conferir a lista de senhas vazadas agora. A senha foi aceita.");
      console.warn("[password] Blocklist HIBP indisponivel. Politica seguiu fail-open.");
    } else if (vazamentos > 0) {
      erros.push("Essa senha ja apareceu em vazamentos publicos. Escolha outra.");
    }
  }

  return { ok: erros.length === 0, erros, avisos };
}
