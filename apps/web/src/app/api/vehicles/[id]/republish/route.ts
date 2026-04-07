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

  try {
    const { id } = await params;

    const vehicle = await prisma.vehicle.findUnique({ where: { id } });

    if (!vehicle) {
      return NextResponse.json({ error: "Veiculo nao encontrado" }, { status: 404 });
    }

    if (vehicle.status !== "PUBLISHED") {
      return NextResponse.json(
        { error: `Apenas veiculos publicados podem ser reenviados. Status atual: ${vehicle.status}` },
        { status: 400 }
      );
    }

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

    // Temporarily set APPROVED so publishVehicle can run
    await prisma.vehicle.update({
      where: { id },
      data: { status: "APPROVED" },
    });

    let results;
    try {
      results = await publishVehicle(id, {
        targetGroupIds,
        formattedAd: formattedAd || vehicle.formattedAd || undefined,
        sellingPrice: sellingPrice || vehicle.sellingPrice || undefined,
        userId: auth.user.id,
      });
    } catch (err) {
      // Restore PUBLISHED status if publishVehicle throws before any send
      await prisma.vehicle.update({ where: { id }, data: { status: "PUBLISHED" } });
      throw err;
    }

    // publishVehicle sets PUBLISHED if any success; if all failed, restore manually
    const anySuccess = results.some((r) => r.success);
    if (!anySuccess) {
      await prisma.vehicle.update({ where: { id }, data: { status: "PUBLISHED" } });
    }

    const groupsPublished = results.filter((r) => r.success).length;
    const groupsFailed = results.filter((r) => !r.success && !r.skippedReason).length;
    const groupsSkipped = results.filter((r) => !!r.skippedReason).length;

    return NextResponse.json({
      message: "Reenvio concluido",
      groupsPublished,
      groupsFailed,
      groupsSkipped,
      results,
    });
  } catch (error) {
    console.error("[Vehicles] Error republishing vehicle:", error);
    return NextResponse.json({ error: "Erro ao reenviar veiculo" }, { status: 500 });
  }
}
