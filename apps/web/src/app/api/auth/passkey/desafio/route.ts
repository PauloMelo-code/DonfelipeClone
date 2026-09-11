import { NextRequest, NextResponse } from "next/server";
import { opcoesDeLogin } from "@/lib/passkey";
import { rateLimit } from "@/lib/rate-limit";
import { extractRequestMeta } from "@/lib/request-meta";

// ---------------------------------------------------------------------------
// Desafio de login por passkey. Rota PUBLICA, e de proposito.
//
// Ela nao recebe e-mail e nao devolve lista de credenciais. O autenticador
// oferece as contas que ele mesmo guarda, e o servidor so descobre de quem e
// a conta depois de conferir a assinatura -- entao esta rota nao tem como
// responder quem tem conta e quem nao tem.
//
// O que ela devolve e um numero aleatorio com cinco minutos de validade e uso
// unico. Pedir mil deles nao aproxima ninguem de nada; o teto por IP existe
// so para nao virar gerador de linhas no banco.
// ---------------------------------------------------------------------------

const LIMITE = { name: "passkey-desafio", maxRequests: 20, windowSeconds: 60 };

export async function POST(request: NextRequest) {
  const { ipAddress } = extractRequestMeta(request);

  if (!rateLimit(LIMITE, ipAddress ?? "desconhecido").allowed) {
    return NextResponse.json({ error: "Aguarde um instante." }, { status: 429 });
  }

  try {
    return NextResponse.json(await opcoesDeLogin());
  } catch (erro) {
    console.error("[auth/passkey] desafio:", erro);
    return NextResponse.json({ error: "Erro ao preparar a entrada" }, { status: 500 });
  }
}
