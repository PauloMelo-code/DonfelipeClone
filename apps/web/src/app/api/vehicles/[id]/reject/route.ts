import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
      return NextResponse.json(
        { error: "Veiculo nao encontrado" },
        { status: 404 }
      );
    }

    if (vehicle.status === "REJECTED") {
      let f: unknown[] = [];
      let p: unknown[] = [];
      try { f = JSON.parse(vehicle.features || "[]"); } catch { /* */ }
      try { p = JSON.parse(vehicle.photos || "[]"); } catch { /* */ }
      return NextResponse.json({ ...vehicle, features: f, photos: p });
    }

    if (vehicle.status !== "PENDING" && vehicle.status !== "APPROVED") {
      return NextResponse.json(
        {
          error: `Veiculo nao pode ser rejeitado no status ${vehicle.status}`,
        },
        { status: 400 }
      );
    }

    let rejectionReason: string | null = null;
    let rejectionTags: string[] | null = null;
    try {
      const body = await request.json();
      rejectionReason = body.rejectionReason || null;
      if (Array.isArray(body.rejectionTags) && body.rejectionTags.length > 0) {
        rejectionTags = body.rejectionTags;
      }
    } catch {
      // Body is optional for rejection
    }

    const updated = await prisma.vehicle.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectionReason,
        rejectionTags: rejectionTags ? JSON.stringify(rejectionTags) : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "VEHICLE_REJECTED",
        entityType: "Vehicle",
        entityId: id,
        vehicleId: id,
        userId: auth.user.id,
        details:
          rejectionReason || rejectionTags
            ? JSON.stringify({
                reason: rejectionReason,
                tags: rejectionTags,
              })
            : null,
      },
    });

    let f: unknown[] = [];
    let p: unknown[] = [];
    try { f = JSON.parse(updated.features || "[]"); } catch { /* */ }
    try { p = JSON.parse(updated.photos || "[]"); } catch { /* */ }
    return NextResponse.json({ ...updated, features: f, photos: p });
  } catch (error) {
    console.error("[Vehicles] Error rejecting vehicle:", error);
    return NextResponse.json(
      { error: "Erro ao rejeitar veiculo" },
      { status: 500 }
    );
  }
}
