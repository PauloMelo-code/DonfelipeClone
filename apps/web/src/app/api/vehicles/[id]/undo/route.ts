import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/vehicles/[id]/undo
 * Reverts last status change to PENDING.
 * Only works if the action was within last 30 seconds AND status is APPROVED or REJECTED.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;
    const vehicle = await prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) return NextResponse.json({ error: "Veiculo nao encontrado" }, { status: 404 });

    if (vehicle.status === "PENDING") {
      return NextResponse.json({ error: "Veiculo ja esta pendente" }, { status: 400 });
    }
    if (vehicle.status === "PUBLISHED") {
      return NextResponse.json({ error: "Veiculo ja foi publicado, nao pode desfazer" }, { status: 400 });
    }

    // Time window: 30 seconds
    const lastChange = vehicle.approvedAt || vehicle.rejectedAt;
    if (!lastChange || Date.now() - new Date(lastChange).getTime() > 30000) {
      return NextResponse.json({ error: "Tempo limite para desfazer expirou (30s)" }, { status: 400 });
    }

    const updated = await prisma.vehicle.update({
      where: { id },
      data: {
        status: "PENDING",
        approvedAt: null,
        rejectedAt: null,
        rejectionReason: null,
        rejectionTags: null,
        autoRejectedReason: null,
        sellingPrice: null,
        formattedAd: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "VEHICLE_UNDO",
        entityType: "Vehicle",
        entityId: id,
        vehicleId: id,
        userId: auth.user.id,
        details: JSON.stringify({ from: vehicle.status }),
      },
    });

    let f: unknown[] = [];
    let p: unknown[] = [];
    try { f = JSON.parse(updated.features || "[]"); } catch { /* */ }
    try { p = JSON.parse(updated.photos || "[]"); } catch { /* */ }
    return NextResponse.json({ ...updated, features: f, photos: p });
  } catch (error) {
    console.error("[undo] Error:", error);
    return NextResponse.json({ error: "Erro ao desfazer" }, { status: 500 });
  }
}
