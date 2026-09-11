import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, veiculos, carimboDeEdicao, travaDeColisao, vivosE } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const soldPrice = typeof body?.soldPrice === "number" ? body.soldPrice : null;
    const soldNotes = typeof body?.soldNotes === "string" ? body.soldNotes.slice(0, 500) : null;

    const [vehicle] = await db
      .select({ updatedAt: veiculos.updatedAt })
      .from(veiculos)
      .where(vivosE(veiculos, eq(veiculos.id, id)))
      .limit(1);
    if (!vehicle) return NextResponse.json({ error: "Veiculo nao encontrado" }, { status: 404 });

    const [updated] = await db
      .update(veiculos)
      .set({
        soldAt: new Date(),
        soldPrice,
        soldNotes,
        ...carimboDeEdicao(auth.user.id),
      })
      .where(travaDeColisao(veiculos, id, vehicle.updatedAt))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Veiculo alterado por outro usuario. Recarregue a tela." },
        { status: 409 }
      );
    }

    await registrarAuditoria({
      action: "VEHICLE_SOLD",
      entityType: "Vehicle",
      entityId: id,
      vehicleId: id,
      userId: auth.user.id,
      details: { soldPrice, soldNotes },
      request,
    });

    return NextResponse.json({ ...updated });
  } catch (error) {
    console.error("[mark-sold] Error:", error);
    return NextResponse.json({ error: "Erro ao marcar como vendido" }, { status: 500 });
  }
}
