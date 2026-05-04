import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { publishVehicle } from "@/lib/publisher";

export async function POST(request: NextRequest) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const body = await request.json();
    const { vehicleIds, targetGroupIds } = body as { vehicleIds: string[]; targetGroupIds?: string[] };

    if (!Array.isArray(vehicleIds) || vehicleIds.length === 0) {
      return NextResponse.json({ error: "vehicleIds obrigatorio" }, { status: 400 });
    }

    const userId = auth.user?.id;

    // Fire-and-forget: respond immediately. Frontend shows "publicando em lote"
    // and polls vehicle list naturally for status updates.
    after(async () => {
      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < vehicleIds.length; i++) {
        if (i > 0) {
          await delay(800 + Math.random() * 1200); // 0.8-2s between vehicles (anti-ban)
        }
        const vehicleId = vehicleIds[i];
        try {
          const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
          if (!vehicle || vehicle.status !== "APPROVED") continue;
          await publishVehicle(vehicleId, {
            targetGroupIds,
            userId,
          });
        } catch (err) {
          console.error(`[BatchPublish] vehicle ${vehicleId} failed:`, err);
        }
      }
    });

    return NextResponse.json({
      status: "queued",
      total: vehicleIds.length,
      message: `${vehicleIds.length} veiculos enfileirados`,
    });
  } catch (error) {
    console.error("[BatchPublish] Error:", error);
    return NextResponse.json({ error: "Erro ao publicar em lote" }, { status: 500 });
  }
}
