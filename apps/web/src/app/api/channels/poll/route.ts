import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkMachineSecret } from "@/lib/machine-auth";
import { buscarPublicacoesDosCanais, simularBuscaDosCanais } from "@/lib/canais/publicacoes";

/**
 * POST /api/channels/poll
 *
 * Busca as publicacoes novas dos canais ativos. O servidor chama sozinho de
 * tempos em tempos (ver instrumentation.ts); esta rota existe pra disparar na
 * mao, pra conferir na hora se um canal esta entregando.
 *
 * Aceita a credencial de maquina (mesma do webhook) ou uma sessao de admin.
 *
 * Com `?simular=1` nao entrega nada e nao move o marcador: so mostra as
 * publicacoes que a busca ve e o que ela decidiria com elas. E o jeito de
 * responder "por que este canal nao captou" sem adivinhar em cima da
 * producao.
 */
export async function POST(request: NextRequest) {
  const maquina = checkMachineSecret(request, {
    headerName: "x-webhook-secret",
    envVar: "WEBHOOK_SECRET",
    queryParam: "secret",
  });

  if (!maquina.ok) {
    const auth = await requireAuth("ADMIN");
    if (!auth.success) return auth.response;
  }

  if (request.nextUrl.searchParams.get("simular")) {
    return NextResponse.json({ simulacao: await simularBuscaDosCanais() });
  }

  const resumo = await buscarPublicacoesDosCanais();
  return NextResponse.json(resumo, { status: resumo.erro ? 503 : 200 });
}
