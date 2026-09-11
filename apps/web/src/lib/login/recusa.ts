import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { registrarRecusa } from "@/lib/trilha-de-login";

// ---------------------------------------------------------------------------
// Recusa unica de login.
//
// TODA recusa responde igual: mesma mensagem e mesmo tempo. "Usuario nao
// encontrado", "Senha incorreta" e "Muitas tentativas" eram tres respostas
// distintas, e o next-auth entrega a mensagem crua ao cliente
// (core/routes/callback.js: error.message vai para a URL de erro). Isso
// enumerava contas por curl.
//
// Vive em modulo proprio porque os dois caminhos de login -- senha e passkey --
// recusam pela mesma porta. Duas copias disto significariam que a proxima
// correcao chegaria so em uma.
// ---------------------------------------------------------------------------

const RECUSA_GENERICA = "Credenciais invalidas";

/** Piso acima do custo do bcrypt (medido em ~156 ms nesta base). */
export const PISO_DE_TEMPO_MS = 250;

/**
 * De onde veio a tentativa. Vai para a trilha, nunca para a resposta.
 *
 * `ip` e nulo quando nao da para saber de quem partiu -- sem proxy na frente,
 * ou cadeia mais curta que a configurada. Nulo honesto e melhor que o valor
 * que o cliente escreveu.
 */
export type Origem = { ip: string | null; userAgent: string | null };

/**
 * Hash de descarte, gerado uma vez por processo sobre valor aleatorio.
 *
 * Serve para o bcrypt rodar tambem quando o e-mail nao existe -- sem isso a
 * resposta volta em ~34 ms contra ~156 ms, e o tempo vira o oraculo que a
 * mensagem uniforme acabou de fechar.
 */
let _hashIsca: string | null = null;
export function hashIsca(): string {
  if (!_hashIsca) {
    _hashIsca = bcrypt.hashSync(randomBytes(32).toString("hex"), 10);
  }
  return _hashIsca;
}

/**
 * Recusa uniforme: registra, completa o piso de tempo e lanca sempre a mesma
 * mensagem.
 *
 * A gravacao da trilha e disparada SEM `await`. Se fosse esperada, o tempo da
 * resposta passaria a depender de a conta existir ou nao -- a linha de e-mail
 * inexistente e a de senha errada custam diferente -- e isso reabriria pelo
 * relogio o oraculo que a mensagem uniforme acabou de fechar. O piso corre em
 * paralelo e absorve a gravacao.
 */
export async function recusar(
  inicio: number,
  contexto: Parameters<typeof registrarRecusa>[0]
): Promise<never> {
  void registrarRecusa(contexto);

  const decorrido = Date.now() - inicio;
  if (decorrido < PISO_DE_TEMPO_MS) {
    await new Promise((r) => setTimeout(r, PISO_DE_TEMPO_MS - decorrido));
  }
  throw new Error(RECUSA_GENERICA);
}
