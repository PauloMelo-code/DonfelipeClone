import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const soldPrice = typeof body?.soldPrice === "number" ? body.soldPrice : null;
    const soldNotes = typeof body?.soldNotes === "string" ? body.soldNotes.slice(0, 500) : null;

    const vehicle = await prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) return NextResponse.json({ error: "Veiculo nao encontrado" }, { status: 404 });

    const updated = await prisma.vehicle.update({
      where: { id },
      data: { soldAt: new Date(), soldPrice, soldNotes },
    });

    await prisma.auditLog.create({
      data: {
        action: "VEHICLE_SOLD",
        entityType: "Vehicle",
        entityId: id,
        vehicleId: id,
        userId: auth.user.id,
        details: JSON.stringify({ soldPrice, soldNotes }),
      },
    });

    return NextResponse.json({ ...updated });
  } catch (error) {
    console.error("[mark-sold] Error:", error);
    return NextResponse.json({ error: "Erro ao marcar como vendido" }, { status: 500 });
  }
}
