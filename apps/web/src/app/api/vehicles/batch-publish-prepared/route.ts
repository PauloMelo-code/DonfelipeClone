import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { publishVehicle } from "@/lib/publisher";

/**
 * POST /api/vehicles/batch-publish-prepared
 *
 * Publica todos os veiculos preparados (preparedAt != null), opcionalmente
 * filtrando por estado ou por lista de IDs explicita.
 *
 * Body:
 *   - state?: string  (UF para filtrar -- ex: "SC", "RS")
 *   - vehicleIds?: string[]  (IDs explicitos -- override do filtro)
 *
 * Usa cada veiculo o targetGroupIds salvo em preparedTargetGroupIds.
 * Roda em background com after() -- responde rapido pro UI.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const stateFilter: string | undefined =
      typeof body?.state === "string" && body.state.trim() ? body.state.toUpperCase() : undefined;
    const explicitIds: string[] | undefined = Array.isArray(body?.vehicleIds)
      ? body.vehicleIds
      : undefined;

    // Levantar veiculos a publicar
    const where: Record<string, unknown> = {
      preparedAt: { not: null },
      status: "APPROVED",
    };
    if (explicitIds && explicitIds.length > 0) {
      where.id = { in: explicitIds };
    } else if (stateFilter) {
      where.state = stateFilter;
    }

    const targets = await prisma.vehicle.findMany({
      where,
      select: {
        id: true,
        formattedAd: true,
        sellingPrice: true,
        preparedTargetGroupIds: true,
      },
    });

    if (targets.length === 0) {
      return NextResponse.json(
        { message: "Nenhum veiculo preparado para o filtro", queued: 0 },
        { status: 200 }
      );
    }

    const userId = auth.user.id;

    // Fire-and-forget com delays anti-ban entre veiculos
    after(async () => {
      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < targets.length; i++) {
        if (i > 0) {
          await delay(800 + Math.random() * 1200); // 0.8-2s entre carros
        }
        const v = targets[i];
        let groupIds: string[] | undefined = undefined;
        if (v.preparedTargetGroupIds) {
          try {
            const parsed = JSON.parse(v.preparedTargetGroupIds);
            if (Array.isArray(parsed) && parsed.length > 0) groupIds = parsed;
          } catch { /* fallback to default groups in publisher */ }
        }
        try {
          await publishVehicle(v.id, {
            targetGroupIds: groupIds,
            formattedAd: v.formattedAd ?? undefined,
            sellingPrice: v.sellingPrice ?? undefined,
            userId,
            quickPublish: true,
          });
          // Limpa marca de "preparado" apos publicar com sucesso
          await prisma.vehicle
            .update({
              where: { id: v.id },
              data: { preparedAt: null, preparedTargetGroupIds: null },
            })
            .catch(() => {});
        } catch (err) {
          console.error(`[BatchPublishPrepared] vehicle ${v.id} failed:`, err);
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        action: "BATCH_PUBLISH_PREPARED",
        userId,
        details: JSON.stringify({
          stateFilter: stateFilter ?? null,
          queued: targets.length,
        }),
      },
    });

    return NextResponse.json({
      message: `${targets.length} veiculos enfileirados para publicacao em background`,
      queued: targets.length,
      stateFilter: stateFilter ?? null,
    });
  } catch (error) {
    console.error("[BatchPublishPrepared] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao enfileirar" },
      { status: 500 }
    );
  }
}
