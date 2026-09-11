import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, count } from "drizzle-orm";
import { db, veiculos, vivosE } from "@/lib/db";
import { registrarAuditoria } from "@/lib/audit";
import { enfileirarPublicacao } from "@/lib/queue/publicacao";
import { requireAuth } from "@/lib/auth";


export async function POST(request: NextRequest) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const body = await request.json();
    const { vehicleIds, targetGroupIds } = body as { vehicleIds: string[]; targetGroupIds?: string[] };

    if (!Array.isArray(vehicleIds) || vehicleIds.length === 0) {
      return NextResponse.json({ error: "vehicleIds obrigatorio" }, { status: 400 });
    }

    const userId = auth.user?.id;

    // Pre-validacao: contar quantos veiculos sao publicaveis (status APPROVED).
    // Se zero, retorna erro imediato em vez de aceitar e silenciosamente nao
    // publicar nada -- evitando o caso "20 enfileirados" mas nada acontece.
    const [contagem] = await db
      .select({ n: count() })
      .from(veiculos)
      .where(vivosE(veiculos, inArray(veiculos.id, vehicleIds), eq(veiculos.status, "APPROVED")));
    const publishable = contagem?.n ?? 0;

    if (publishable === 0) {
      return NextResponse.json(
        {
          error: "Nenhum veiculo publicavel na selecao (precisam estar APROVADOS)",
          total: vehicleIds.length,
        },
        { status: 400 }
      );
    }

    // Fire-and-forget direto via Promise (NAO usa after()).
    // Em alguns deploys self-hosted (Docker/Easypanel/proxies), after() pode
    // nao executar -- a request retorna 200 e o callback eh descartado.
    // Promise solto eh menos elegante mas funciona em qualquer ambiente Node.
    // Cada veiculo vira um job. A fila garante ordem de entrada, uma
    // publicacao por vez e retentativa -- o laco com delay que rodava
    // dentro da requisicao sumiu.
    for (const vehicleId of vehicleIds) {
      await enfileirarPublicacao({
        vehicleId,
        targetGroupIds,
        userId,
        quickPublish: true,
      });
    }

    await registrarAuditoria({
      action: "BATCH_PUBLISH_QUEUED",
      userId,
      details: {
        total: vehicleIds.length,
        publicaveis: publishable,
        targetGroupCount: targetGroupIds?.length ?? 0,
      },
      request,
    });

    return NextResponse.json({
      status: "queued",
      total: vehicleIds.length,
      publishable,
      skipped: vehicleIds.length - publishable,
      message: `${publishable} veiculos enfileirados (${vehicleIds.length - publishable} ignorados)`,
    });
  } catch (error) {
    console.error("[BatchPublish] Error:", error);
    return NextResponse.json({ error: "Erro ao publicar em lote" }, { status: 500 });
  }
}
