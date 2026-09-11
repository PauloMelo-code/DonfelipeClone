import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, isNotNull, type SQL } from "drizzle-orm";
import { db, veiculos, vivos, vivosE } from "@/lib/db";
import { registrarAuditoria } from "@/lib/audit";
import { enfileirarPublicacao } from "@/lib/queue/publicacao";
import { requireAuth } from "@/lib/auth";

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
    const condicoes: (SQL | undefined)[] = [
      vivos(veiculos),
      isNotNull(veiculos.preparedAt),
      eq(veiculos.status, "APPROVED"),
    ];
    if (explicitIds && explicitIds.length > 0) {
      condicoes.push(inArray(veiculos.id, explicitIds));
    } else if (stateFilter) {
      condicoes.push(eq(veiculos.state, stateFilter));
    }

    const targets = await db
      .select({
        id: veiculos.id,
        formattedAd: veiculos.formattedAd,
        sellingPrice: veiculos.sellingPrice,
        preparedTargetGroupIds: veiculos.preparedTargetGroupIds,
      })
      .from(veiculos)
      .where(vivosE(veiculos, ...condicoes.slice(1)));

    if (targets.length === 0) {
      return NextResponse.json(
        { message: "Nenhum veiculo preparado para o filtro", queued: 0 },
        { status: 200 }
      );
    }

    const userId = auth.user.id;

    // Fire-and-forget com delays anti-ban entre veiculos
    // Um job por veiculo preparado.
    for (const v of targets) {
      let groupIds: string[] | undefined;
      try {
        groupIds = v.preparedTargetGroupIds
          ? (JSON.parse(v.preparedTargetGroupIds) as string[])
          : undefined;
      } catch {
        groupIds = undefined;
      }
      await enfileirarPublicacao({
        vehicleId: v.id,
        targetGroupIds: groupIds,
        formattedAd: v.formattedAd ?? undefined,
        sellingPrice: v.sellingPrice ?? undefined,
        userId,
        quickPublish: true,
      });
    }

    await registrarAuditoria({
      action: "BATCH_PUBLISH_PREPARED",
      userId,
      details: {
        stateFilter: stateFilter ?? null,
        queued: targets.length,
      },
      request,
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
