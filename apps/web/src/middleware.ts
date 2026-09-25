import { NextRequest, NextResponse } from "next/server";
import { conferirOrigem, isentoDeOrigem } from "@/lib/origem";

// ---------------------------------------------------------------------------
// A borda.
//
// Ela NAO e a barreira de autenticacao -- so confere se ha cookie, e cookie
// forjado passa por aqui de proposito para o handler recusar com 401. Isso foi
// medido: cookie invalido atravessa a borda e o handler responde 401.
//
// O que ela faz de verdade:
//
//   1. Manda quem nao tem cookie nenhum para o login, em vez de deixar a tela
//      quebrar em pedacos.
//   2. Confere a ORIGEM de toda requisicao mutante. Aqui, e nao em quarenta
//      handlers, porque a rota que alguem criar amanha precisa nascer coberta
//      -- e uma lista de quarenta chamadas e uma lista que esquece a proxima.
//   3. Marca as respostas de API como nao-cacheaveis.
// ---------------------------------------------------------------------------

/**
 * Rotas que dispensam o cookie de sessao.
 *
 * Caminho EXATO ou prefixo com barra -- nunca `startsWith` solto: `/api/health`
 * cru tambem liberaria `/api/healthzinho-secreto` se alguem criasse.
 */
const PUBLICAS = [
  "/login",
  "/api/auth",
  "/api/webhook",
  "/api/health",
  // Canal de MAQUINA: o monitor externo autentica por `x-health-secret`, em
  // tempo constante, no proprio handler. Estava fora desta lista e a auditoria
  // de 2026-09-10 mediu 307 para o monitor -- ou seja, a rota de monitoria
  // nunca era alcancada. So ela, nunca `/api/whatsapp` inteiro: os vizinhos
  // (`qr`, `send-qr`, `status`) sao administrativos.
  "/api/whatsapp/health-monitor",
  // Idem: canal de maquina, autenticado no handler. Sem sessao de admin e sem
  // segredo a rota responde 401 sozinha.
  "/api/channels/poll",
  "/_next",
  "/favicon",
];

function ehPublica(pathname: string): boolean {
  return PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Arquivo estatico servido da pasta publica.
 *
 * Conferido pelo ULTIMO segmento, e nao pelo caminho inteiro: `endsWith(".png")`
 * cru liberaria qualquer rota que terminasse assim, inclusive uma rota dinamica
 * com parametro escolhido pelo cliente.
 */
function ehEstatico(pathname: string): boolean {
  const ultimo = pathname.slice(pathname.lastIndexOf("/") + 1);
  return /\.(webp|png|ico|svg|jpg|jpeg|avif|woff2?)$/i.test(ultimo) && !pathname.startsWith("/api/");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ---- Origem, antes de tudo -------------------------------------------
  //
  // Vem antes do portao de sessao de proposito: uma requisicao de outro site
  // nao merece nem o redirecionamento para o login, que ja seria uma resposta
  // diferente conforme o estado da vitima.
  if (!isentoDeOrigem(pathname)) {
    const veredicto = conferirOrigem(request.method, request.headers);
    if (!veredicto.ok) {
      return NextResponse.json(
        { error: "Origem nao autorizada" },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  if (ehPublica(pathname) || ehEstatico(pathname)) {
    return NextResponse.next();
  }

  // Presenca do cookie, e so isso. Quem decide se ele vale e `conferirSessao`,
  // no servidor, lendo a linha de `users_sessions`.
  const sessionToken =
    request.cookies.get("next-auth.session-token")?.value ||
    request.cookies.get("__Secure-next-auth.session-token")?.value;

  if (!sessionToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const resposta = NextResponse.next();

  // Resposta autenticada nao entra em cache compartilhado. O computador da
  // loja e usado por varias pessoas, e o proxy da rede tambem.
  //
  // `/api/media` fica de fora: o cabecalho daqui SOBRESCREVE o do handler, e
  // aquele handler ja escolheu `private, immutable` de proposito. Sem esta
  // excecao, cada rolagem da lista de veiculos rebaixaria todas as fotos --
  // medido enquanto verificava a correcao.
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/media/")) {
    resposta.headers.set("Cache-Control", "no-store");
  }

  return resposta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
