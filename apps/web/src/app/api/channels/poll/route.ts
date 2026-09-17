import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkMachineSecret } from "@/lib/machine-auth";
import { buscarPublicacoesDosCanais } from "@/lib/canais/publicacoes";

/**
 * POST /api/channels/poll
 *
 * Busca as publicacoes novas dos canais ativos. O servidor chama sozinho de
 * tempos em tempos (ver instrumentation.ts); esta rota existe pra disparar na
 * mao, pra conferir na hora se um canal esta entregando.
 *
 * Aceita a credencial de maquina (mesma do webhook) ou uma sessao de admin.
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

  const resumo = await buscarPublicacoesDosCanais();
  return NextResponse.json(resumo, { status: resumo.erro ? 503 : 200 });
}
