// ---------------------------------------------------------------------------
// De onde a requisicao diz que veio -- e se batemos com isso.
//
// A auditoria de 2026-09-10 mediu o buraco: `POST /api/users` com
// `Origin: https://evil.example` e um cookie de sessao valido devolveu 201 e
// criou a conta. Nao havia UMA checagem de origem no projeto inteiro; a unica
// defesa era o `SameSite=Lax` do cookie, que o navegador aplica e que nao
// cobre navegacao de topo por GET nem subdominio comprometido.
//
// A origem esperada vem da CONFIGURACAO (`NEXTAUTH_URL`), nunca de
// `request.url` nem do cabecalho `Host`: derivar da propria requisicao e pedir
// ao atacante que diga qual origem ele considera legitima.
// ---------------------------------------------------------------------------

/** Metodos que mudam estado. GET e HEAD nao deveriam mudar nada. */
const METODOS_MUTANTES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Caminhos que NAO passam por esta checagem, e por que.
 *
 * Nao e "rota que a tela nao usa": e canal sem navegador, onde exigir `Origin`
 * so quebraria a integracao sem proteger ninguem. CSRF pressupoe um navegador
 * anexando cookie sozinho; sem cookie nao ha o que forjar.
 */
const ISENTOS = [
  // O next-auth traz o proprio token de CSRF no corpo do formulario.
  "/api/auth",
  // Canais de maquina: autenticam por segredo em cabecalho, nao por cookie.
  "/api/webhook",
  "/api/whatsapp/health-monitor",
];

export function isentoDeOrigem(pathname: string): boolean {
  return ISENTOS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** A origem que o servidor aceita, lida do ambiente. */
export function origemEsperada(): string | null {
  const bruto = process.env.NEXTAUTH_URL ?? "";
  if (!bruto) return null;
  try {
    return new URL(bruto).origin;
  } catch {
    return null;
  }
}

export type VeredictoDaOrigem =
  | { ok: true }
  | { ok: false; motivo: "origem_diferente" | "sem_origem" };

/**
 * A requisicao veio de onde deveria?
 *
 * Ordem de leitura:
 *
 *   1. `Origin`, quando o navegador manda. E o sinal forte, e o navegador nao
 *      deixa a pagina mentir nele.
 *   2. `Sec-Fetch-Site`, que todo navegador atual manda e que responde a
 *      pergunta diretamente: `same-origin` e `none` (barra de enderecos) valem.
 *   3. Nenhum dos dois: RECUSA. Um navegador sempre manda pelo menos um; quem
 *      nao manda e um cliente programatico, e cliente programatico com cookie
 *      de sessao e exatamente o que nao queremos deixar passar.
 *
 * `origemEsperada` ausente tambem e recusa: sem configuracao nao ha com o que
 * comparar, e adivinhar pela requisicao seria o defeito original de volta.
 */
export function conferirOrigem(
  metodo: string,
  cabecalhos: { get(nome: string): string | null }
): VeredictoDaOrigem {
  if (!METODOS_MUTANTES.has(metodo.toUpperCase())) return { ok: true };

  const esperada = origemEsperada();
  const origem = cabecalhos.get("origin");

  if (origem) {
    return origem === esperada ? { ok: true } : { ok: false, motivo: "origem_diferente" };
  }

  const destino = cabecalhos.get("sec-fetch-site");
  if (destino === "same-origin" || destino === "none") return { ok: true };
  if (destino) return { ok: false, motivo: "origem_diferente" };

  return { ok: false, motivo: "sem_origem" };
}
