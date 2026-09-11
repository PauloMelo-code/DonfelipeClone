import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, veiculos, carimboDeEdicao, travaDeColisao, vivosE } from "@/lib/db";
import { registrarAuditoria } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/vehicles/[id]/prepare
 *
 * Marca o veiculo como "preparado pra postar depois". Salva edicoes do modal
 * (texto, preco, fotos, grupos destino) sem disparar o envio. Aparece na aba
 * "Prontos" e pode ser publicado em massa via batch-publish-prepared.
 *
 * Body opcional:
 *   - formattedAd?: string
 *   - sellingPrice?: number
 *   - photos?: string[] (URLs ou data URIs)
 *   - targetGroupIds?: string[] (whatsappgroup.groupId)
 *
 * Permite preparar veiculos PENDING (auto-aprova primeiro) ou APPROVED.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const formattedAd: string | undefined =
      typeof body?.formattedAd === "string" && body.formattedAd.trim() ? body.formattedAd : undefined;
    const sellingPrice: number | undefined =
      typeof body?.sellingPrice === "number" && body.sellingPrice > 0 ? body.sellingPrice : undefined;
    const photos: string[] | undefined = Array.isArray(body?.photos) ? body.photos : undefined;
    const targetGroupIds: string[] | undefined = Array.isArray(body?.targetGroupIds)
      ? body.targetGroupIds
      : undefined;

    const [vehicle] = await db
      .select()
      .from(veiculos)
      .where(vivosE(veiculos, eq(veiculos.id, id)))
      .limit(1);
    if (!vehicle) {
      return NextResponse.json({ error: "Veiculo nao encontrado" }, { status: 404 });
    }

    if (vehicle.status === "REJECTED" || vehicle.status === "PUBLISHED") {
      return NextResponse.json(
        { error: `Nao pode preparar veiculo com status ${vehicle.status}` },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {
      preparedAt: new Date(),
    };

    // Auto-aprova se ainda PENDING
    if (vehicle.status === "PENDING") {
      data.status = "APPROVED";
      if (!vehicle.approvedAt) data.approvedAt = new Date();
    }

    if (formattedAd) data.formattedAd = formattedAd;
    if (sellingPrice) data.sellingPrice = sellingPrice;
    if (photos) data.photos = JSON.stringify(photos);
    if (targetGroupIds) data.preparedTargetGroupIds = JSON.stringify(targetGroupIds);

    const [updated] = await db
      .update(veiculos)
      .set({ ...data, ...carimboDeEdicao(auth.user.id) })
      .where(travaDeColisao(veiculos, id, body?.updatedAt ?? vehicle.updatedAt))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Veiculo alterado por outro usuario. Recarregue a tela." },
        { status: 409 }
      );
    }

    await registrarAuditoria({
      action: "VEHICLE_PREPARED",
      entityType: "Vehicle",
      entityId: id,
      vehicleId: id,
      userId: auth.user.id,
      request,
      details: {
        previousStatus: vehicle.status,
        targetGroupCount: targetGroupIds?.length ?? 0,
      },
    });

    return NextResponse.json({
      message: "Veiculo preparado",
      vehicleId: updated.id,
      preparedAt: updated.preparedAt,
      targetGroupCount: targetGroupIds?.length ?? 0,
    });
  } catch (error) {
    console.error("[Prepare] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao preparar" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/vehicles/[id]/prepare
 *
 * Cancela a preparacao -- volta o veiculo pra Aprovados normal.
 * Mantem formattedAd e photos editados (sao persistentes).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;

  try {
    await db
      .update(veiculos)
      .set({
        preparedAt: null,
        preparedTargetGroupIds: null,
        ...carimboDeEdicao(auth.user.id),
      })
      .where(vivosE(veiculos, eq(veiculos.id, id)));
    return NextResponse.json({ message: "Preparacao cancelada" });
  } catch (error) {
    console.error("[Prepare DELETE] Error:", error);
    return NextResponse.json({ error: "Erro ao cancelar" }, { status: 500 });
  }
}
