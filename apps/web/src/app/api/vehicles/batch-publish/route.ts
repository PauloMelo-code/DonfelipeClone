import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { publishVehicle } from "@/lib/publisher";

// Marca pra diagnostico -- registra que o batch ENTROU em execucao em background.
// Se isso nao aparecer no AuditLog mas a request retornou 200, sabemos que o
// after() nao esta sendo invocado no ambiente deles.
async function logBatchStart(userId: string | undefined, total: number) {
  await prisma.auditLog
    .create({
      data: {
        action: "BATCH_PUBLISH_STARTED",
        userId,
        details: JSON.stringify({ total, startedAt: new Date().toISOString() }),
      },
    })
    .catch((err) => console.error("[BatchPublish] failed to log start:", err));
}

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
    const publishable = await prisma.vehicle.count({
      where: { id: { in: vehicleIds }, status: "APPROVED" },
    });

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
    void (async () => {
      // Loga inicio no banco pra rastreabilidade -- se BATCH_PUBLISH_STARTED
      // existir mas BATCH_PUBLISH_COMPLETED nao, sabemos que algo no meio
      // matou o processo.
      await logBatchStart(userId, vehicleIds.length);

      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let succeeded = 0;
      let failed = 0;
      let skipped = 0;

      for (let i = 0; i < vehicleIds.length; i++) {
        if (i > 0) {
          await delay(800 + Math.random() * 1200); // 0.8-2s between vehicles (anti-ban)
        }
        const vehicleId = vehicleIds[i];
        try {
          const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
          if (!vehicle) {
            skipped++;
            console.warn(`[BatchPublish] vehicle ${vehicleId} not found`);
            continue;
          }
          if (vehicle.status !== "APPROVED") {
            skipped++;
            console.warn(`[BatchPublish] vehicle ${vehicleId} skipped (status=${vehicle.status})`);
            continue;
          }
          await publishVehicle(vehicleId, {
            targetGroupIds,
            // Le formattedAd, sellingPrice e photos do DB -- foram salvos
            // no autosave do modal ou no fluxo individual de edicao.
            formattedAd: vehicle.formattedAd ?? undefined,
            sellingPrice: vehicle.sellingPrice ?? undefined,
            userId,
            quickPublish: true, // batch -- ja tem delay entre veiculos, nao precisa do anti-ban interno
          });
          succeeded++;
        } catch (err) {
          failed++;
          console.error(`[BatchPublish] vehicle ${vehicleId} failed:`, err);
        }
      }

      // Audit log no fim do batch pra rastreabilidade
      await prisma.auditLog
        .create({
          data: {
            action: "BATCH_PUBLISH_COMPLETED",
            userId,
            details: JSON.stringify({
              total: vehicleIds.length,
              succeeded,
              failed,
              skipped,
              targetGroupCount: targetGroupIds?.length ?? 0,
            }),
          },
        })
        .catch(() => {});

      console.log(
        `[BatchPublish] DONE total=${vehicleIds.length} succeeded=${succeeded} failed=${failed} skipped=${skipped}`
      );
    })();

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
