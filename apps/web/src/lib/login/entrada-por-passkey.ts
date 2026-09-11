import { eq } from "drizzle-orm";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { db, usuarios, vivosE } from "@/lib/db";
import { estaTravada, limparFalhas } from "@/lib/bloqueio-de-conta";
import { conferirLogin } from "@/lib/passkey";
import { registrarEntrada } from "@/lib/trilha-de-login";
import { abrirSessao } from "@/lib/sessoes";
import { recusar, type Origem } from "./recusa";

// ---------------------------------------------------------------------------
// Entrada por passkey.
//
// Chamada de dentro do `authorize`, e nunca por um provider proprio: o funil de
// sessao e um so, e e la que moram o teto por IP, o bloqueio por conta, o piso
// de tempo e a trilha. Um segundo caminho de login seria o caminho que alguem
// esquece de proteger na proxima mudanca.
//
// Nao falta um fator aqui. A passkey ja e posse do autenticador MAIS a
// biometria ou o PIN que o servidor exige, e a assinatura e feita sobre o
// dominio de quem pediu -- por isso uma tela falsa nao consegue reaproveita-la,
// coisa que a senha e o codigo de seis digitos nao impedem.
// ---------------------------------------------------------------------------

/** Teto do corpo antes de virar JSON. Uma asserção real tem poucos KB. */
const TAMANHO_MAXIMO_DA_ASSINATURA = 8000;

export interface ContaAutenticada {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "OPERATOR";
  /** A linha que acabou de nascer em `users_sessions`. */
  sessionId: string;
}

/**
 * Uma recusa aqui NAO conta falha na conta.
 *
 * Dois motivos: a assinatura invalida nao diz de quem era a credencial, entao
 * nao ha conta a punir; e cada tentativa ja queima um desafio de uso unico, o
 * que torna a repeticao inutil sem precisar de contador. Conta travada e conta
 * desativada continuam barradas, como em qualquer outro caminho.
 */
export async function entrarPorPasskey(
  inicio: number,
  assinatura: string,
  origem: Origem
): Promise<ContaAutenticada> {
  if (assinatura.length > TAMANHO_MAXIMO_DA_ASSINATURA) {
    return recusar(inicio, { motivo: "entrada_malformada", ...origem });
  }

  let resposta: AuthenticationResponseJSON;
  try {
    resposta = JSON.parse(assinatura);
  } catch {
    return recusar(inicio, { motivo: "entrada_malformada", ...origem });
  }

  const entrada = await conferirLogin(resposta);
  if (!entrada) {
    return recusar(inicio, { motivo: "passkey_invalida", ...origem });
  }

  const [user] = await db
    .select()
    .from(usuarios)
    .where(vivosE(usuarios, eq(usuarios.id, entrada.userId)))
    .limit(1);
  if (!user) {
    return recusar(inicio, { motivo: "passkey_invalida", ...origem });
  }

  if (estaTravada(user).travada) {
    return recusar(inicio, {
      motivo: "conta_travada", email: user.email, userId: user.id, ...origem,
    });
  }
  if (!user.active) {
    return recusar(inicio, {
      motivo: "conta_desativada", email: user.email, userId: user.id, ...origem,
    });
  }

  await limparFalhas(user.id);
  void registrarEntrada({
    userId: user.id, email: user.email, meio: "passkey", ...origem,
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as "ADMIN" | "OPERATOR",
    sessionId: await abrirSessao(user.id, origem),
  };
}
