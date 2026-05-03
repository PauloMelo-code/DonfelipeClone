import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publishVehicle } from "@/lib/publisher";
import { requireAuth } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;

  // Atomic claim: lock vehicle to prevent double-click race
  const claim = await prisma.vehicle.updateMany({
    where: {
      id,
      status: { in: ["PENDING", "APPROVED"] },
      OR: [
        { publishingLockedAt: null },
        { publishingLockedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) } }, // 5 min stale lock
      ],
    },
    data: { publishingLockedAt: new Date() },
  });

  if (claim.count === 0) {
    return NextResponse.json({ error: "Veiculo ja em processamento ou ja publicado" }, { status: 409 });
  }

  try {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
    });

    if (!vehicle) {
      return NextResponse.json(
        { error: "Veiculo nao encontrado" },
        { status: 404 }
      );
    }

    if (vehicle.status !== "APPROVED") {
      return NextResponse.json(
        {
          error: `Veiculo precisa estar aprovado para publicar. Status atual: ${vehicle.status}`,
        },
        { status: 400 }
      );
    }

    if (!vehicle.formattedAd) {
      return NextResponse.json(
        { error: "Veiculo nao possui anuncio formatado" },
        { status: 400 }
      );
    }

    // Parse optional body params
    let targetGroupIds: string[] | undefined;
    let formattedAd: string | undefined;
    let sellingPrice: number | undefined;
    try {
      const body = await request.json();
      targetGroupIds = body.targetGroupIds;
      formattedAd = body.formattedAd;
      sellingPrice = body.sellingPrice;
    } catch {
      // Body is optional
    }

    const results = await publishVehicle(id, {
      targetGroupIds,
      formattedAd,
      sellingPrice,
      userId: auth.user.id,
    });
    const groupsPublished = results.filter((r) => r.success).length;
    const groupsFailed = results.filter((r) => !r.success).length;

    return NextResponse.json({
      message: "Veiculo publicado com sucesso",
      groupsPublished,
      groupsFailed,
      results,
    });
  } catch (error) {
    console.error("[Vehicles] Error publishing vehicle:", error);
    return NextResponse.json(
      { error: "Erro ao publicar veiculo" },
      { status: 500 }
    );
  } finally {
    await prisma.vehicle.update({
      where: { id },
      data: { publishingLockedAt: null },
    }).catch(() => {});
  }
}
