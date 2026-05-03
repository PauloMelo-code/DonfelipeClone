import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { formatVehicleAd } from "@/lib/vehicle-formatter";
import { publishVehicle } from "@/lib/publisher";

/**
 * POST /api/vehicles/[id]/publish-direct
 * Fast-track: aprova (se PENDING) e publica direto nos grupos da regiao do veiculo.
 */
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

    // Auto-aprovar se PENDING (replica logica do approve/route.ts)
    if (vehicle.status === "PENDING") {
      // Auto-extract FIPE
      let fipePrice = vehicle.fipePrice;
      if (fipePrice == null && vehicle.rawDescription) {
        const m = vehicle.rawDescription.match(/fipe\s*:?\s*r?\$?\s*([\d.,]+)\s*(mil)?/i);
        if (m) {
          let raw = m[1];
          if (m[2]?.toLowerCase() === "mil") {
            fipePrice = parseFloat(raw.replace(",", ".")) * 1000;
          } else {
            raw = raw.replace(/\./g, "").replace(",", ".");
            const n = parseFloat(raw);
            if (!isNaN(n) && n >= 1000) fipePrice = n;
          }
        }
      }

      const marginSetting = await prisma.setting.findUnique({ where: { key: "profit_margin_percent" } });
      const margin = marginSetting ? parseFloat(marginSetting.value) : 10;

      // Smart pricing
      let effectiveMargin = margin;
      if (fipePrice && vehicle.rawDescription) {
        const discount = 1 - (vehicle.price / fipePrice);
        const desc = vehicle.rawDescription.toLowerCase();
        const hasGoodIndicators = vehicle.km < 60000 || /\b(unico\s*dono|único\s*dono|procedencia|sem\s*detalhes|revisado|revisões|revisoes)\b/i.test(desc);
        const hasNoRedFlags = !/\b(leil[aã]o|sinistro|batido|enchente|recuperado)\b/i.test(desc);
        if (discount <= 0.12 && hasGoodIndicators && hasNoRedFlags) effectiveMargin = 0;
      }

      const sellingPrice = vehicle.price * (1 + effectiveMargin / 100);
      let features: string[] = [];
      try { features = JSON.parse(vehicle.features || "[]"); } catch {}

      const formattedAd = formatVehicleAd({
        model: vehicle.model, brand: vehicle.brand, year: vehicle.year,
        yearModel: vehicle.yearModel, km: vehicle.km, price: vehicle.price,
        fipePrice, transmission: vehicle.transmission, fuel: vehicle.fuel,
        features, rawDescription: vehicle.rawDescription,
      }, { profitMarginPercent: effectiveMargin });

      await prisma.vehicle.update({
        where: { id },
        data: { status: "APPROVED", sellingPrice, formattedAd, fipePrice, approvedAt: new Date() },
      });
    }

    // Auto-selecionar grupos destino baseado no estado
    let targetGroups;
    if (vehicle.state) {
      targetGroups = await prisma.whatsAppGroup.findMany({
        where: { role: "TARGET", active: true, region: vehicle.state },
      });
      // Fallback: se nao tem grupos da regiao, usa todos
      if (targetGroups.length === 0) {
        targetGroups = await prisma.whatsAppGroup.findMany({
          where: { role: "TARGET", active: true },
        });
      }
    } else {
      targetGroups = await prisma.whatsAppGroup.findMany({
        where: { role: "TARGET", active: true },
      });
    }

    if (targetGroups.length === 0) {
      return NextResponse.json({ error: "Nenhum grupo destino configurado" }, { status: 400 });
    }

    // Publicar
    const results = await publishVehicle(id, {
      targetGroupIds: targetGroups.map((g) => g.groupId),
      userId: auth.user.id,
    });

    const totalSent = results.filter((r) => r.success).length;
    const totalFailed = results.filter((r) => !r.success && !r.skippedReason).length;
    const totalSkipped = results.filter((r) => !!r.skippedReason).length;

    await prisma.auditLog.create({
      data: {
        action: "VEHICLE_PUBLISHED_DIRECT",
        entityType: "Vehicle",
        entityId: id,
        vehicleId: id,
        userId: auth.user.id,
        details: JSON.stringify({
          triggeredBy: "fast-track",
          sourceState: vehicle.state,
          destinationGroups: targetGroups.length,
          totalSent,
          totalFailed,
          totalSkipped,
        }),
      },
    });

    return NextResponse.json({
      status: "published",
      sourceState: vehicle.state,
      destinationGroups: targetGroups.length,
      totalSent,
      totalFailed,
      totalSkipped,
      results,
    });
  } catch (error) {
    console.error("[publish-direct] Error:", error);
    return NextResponse.json({ error: "Erro ao publicar direto" }, { status: 500 });
  }
}
