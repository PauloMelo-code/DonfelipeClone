import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listar, revogarTodasDe } from "@/lib/sessoes";
import { registrarSaida } from "@/lib/trilha-de-login";
import { extractRequestMeta } from "@/lib/request-meta";

// ---------------------------------------------------------------------------
// As sessoes abertas da SESSAO CORRENTE: ver e encerrar as outras.
//
// A regua pede que o dono veja onde a conta dele esta aberta e consiga fechar
// -- e a unica reacao possivel a "esqueci logado no computador da loja" ou
// "acho que alguem entrou". Enquanto a sessao vivia so no token, nao existia
// nem a lista nem o botao.
//
// A listagem devolve origem e datas. Nada aqui autentica: o id e um ponteiro,
// e sem o cookie assinado nao abre nada. A tela precisa dele para marcar qual
// e a sessao atual.
// ---------------------------------------------------------------------------

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const abertas = await listar(auth.user.id);
  return NextResponse.json({
    sessoes: abertas.map((s) => ({ ...s, atual: s.id === auth.sessaoId })),
    atual: auth.sessaoId,
  });
}

/**
 * Encerra TODAS as outras. A atual fica.
 *
 * Encerrar a atual junto seria hostil: quem clica em "sair dos outros
 * aparelhos" quer continuar usando este. Para sair deste existe o botao de
 * sair, que passa pelo evento do proprio next-auth.
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const quantas = await revogarTodasDe(auth.user.id, "pelo-dono", {
    exceto: auth.sessaoId,
  });

  if (quantas > 0) {
    const meta = extractRequestMeta(request);
    await registrarSaida({
      userId: auth.user.id,
      sessaoId: auth.sessaoId,
      motivo: "encerradas-pelo-dono",
      quantas,
      ip: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  return NextResponse.json({ ok: true, encerradas: quantas });
}
