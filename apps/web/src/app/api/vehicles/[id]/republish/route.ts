import { NextRequest, NextResponse, after } from "next/server";
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

  // Atomic claim: lock vehicle to prevent double-click race.
  // Republish operates on PUBLISHED vehicles (and APPROVED transient state set below).
  const claim = await prisma.vehicle.updateMany({
    where: {
      id,
      status: { in: ["PUBLISHED", "APPROVED"] },
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

    // Fire-and-forget: respond immediately, run republish in background.
    const userId = auth.user.id;
    const adForBg = formattedAd || vehicle.formattedAd || undefined;
    const priceForBg = sellingPrice || vehicle.sellingPrice || undefined;
    const ids = targetGroupIds;

    after(async () => {
      try {
        const results = await publishVehicle(id, {
          targetGroupIds: ids,
          formattedAd: adForBg,
          sellingPrice: priceForBg,
          userId,
          quickPublish: true,
        });
        // publishVehicle sets PUBLISHED if any success; if all failed, restore manually
        const anySuccess = results.some((r) => r.success);
        if (!anySuccess) {
          await prisma.vehicle.update({ where: { id }, data: { status: "PUBLISHED" } });
        }
      } catch (err) {
        console.error("[Vehicles] Background republish failed:", err);
        await prisma.vehicle
          .update({ where: { id }, data: { status: "PUBLISHED" } })
          .catch(() => {});
      } finally {
        await prisma.vehicle
          .update({ where: { id }, data: { publishingLockedAt: null } })
          .catch(() => {});
      }
    });

    return NextResponse.json({
      message: "Reenvio enfileirado",
      status: "publishing",
      groupsPublished: targetGroupIds?.length ?? 0,
      groupsFailed: 0,
      groupsSkipped: 0,
      results: [],
    });
  } catch (error) {
    console.error("[Vehicles] Error republishing vehicle:", error);
    await prisma.vehicle
      .update({ where: { id }, data: { publishingLockedAt: null } })
      .catch(() => {});
    return NextResponse.json({ error: "Erro ao reenviar veiculo" }, { status: 500 });
  }
}
