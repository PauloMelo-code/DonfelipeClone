import { NextRequest, NextResponse } from "next/server";
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

    const results: Array<{ vehicleId: string; model: string; success: boolean; groupsPublished: number; error?: string }> = [];
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    for (let i = 0; i < vehicleIds.length; i++) {
      if (i > 0) {
        await delay(3000 + Math.random() * 5000); // 3-8s between vehicles
      }
      const vehicleId = vehicleIds[i];
      const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
      if (!vehicle || vehicle.status !== "APPROVED") {
        results.push({ vehicleId, model: vehicle?.model ?? vehicleId, success: false, groupsPublished: 0, error: "Veiculo nao aprovado" });
        continue;
      }
      try {
        const publishResults = await publishVehicle(vehicleId, {
          targetGroupIds,
          userId: auth.user?.id,
        });
        const published = publishResults.filter((r) => r.success).length;
        results.push({ vehicleId, model: vehicle.model, success: published > 0, groupsPublished: published });
      } catch (err) {
        results.push({ vehicleId, model: vehicle.model, success: false, groupsPublished: 0, error: String(err) });
      }
    }

    const totalPublished = results.filter((r) => r.success).length;
    return NextResponse.json({ results, totalPublished, total: vehicleIds.length });
  } catch (error) {
    console.error("[BatchPublish] Error:", error);
    return NextResponse.json({ error: "Erro ao publicar em lote" }, { status: 500 });
  }
}
