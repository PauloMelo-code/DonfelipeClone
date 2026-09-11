import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { revogar } from "@/lib/sessoes";
import { registrarSaida } from "@/lib/trilha-de-login";
import { extractRequestMeta } from "@/lib/request-meta";

// ---------------------------------------------------------------------------
// Encerra UMA sessao do proprio dono.
//
// O `userId` entra no WHERE da revogacao: saber o id de uma sessao alheia nao
// basta para derruba-la. E o id nem e segredo -- ele so aponta para a linha, e
// sem o cookie assinado nao abre nada.
//
// Encerrar nao pede o codigo do fator, de proposito. Fechar uma sessao e uma
// acao de SEGURANCA: quem desconfia de acesso estranho precisa conseguir
// cortar na hora, e nao ser barrado por um celular que talvez esteja
// justamente no bolso de outra pessoa.
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!(await revogar(id, auth.user.id, "pelo-dono"))) {
    return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 404 });
  }

  const meta = extractRequestMeta(request);
  await registrarSaida({
    userId: auth.user.id,
    sessaoId: id,
    motivo: id === auth.sessaoId ? "encerrou-a-propria" : "encerrada-pelo-dono",
    ip: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true, eraAAtual: id === auth.sessaoId });
}
