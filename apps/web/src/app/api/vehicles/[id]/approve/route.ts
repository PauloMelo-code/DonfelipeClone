import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatVehicleAd } from "@/lib/vehicle-formatter";
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

    if (vehicle.status === "APPROVED") {
      // Idempotent: already approved, return success
      let f: unknown[] = [];
      let p: unknown[] = [];
      try { f = JSON.parse(vehicle.features || "[]"); } catch { /* */ }
      try { p = JSON.parse(vehicle.photos || "[]"); } catch { /* */ }
      return NextResponse.json({ ...vehicle, features: f, photos: p });
    }

    if (vehicle.status !== "PENDING") {
      return NextResponse.json(
        { error: `Veiculo nao pode ser aprovado no status ${vehicle.status}` },
        { status: 400 }
      );
    }

    // Auto-extract FIPE from rawDescription if missing
    let fipePrice = vehicle.fipePrice;
    if (fipePrice == null && vehicle.rawDescription) {
      const fipeMatch = vehicle.rawDescription.match(
        /fipe\s*:?\s*r?\$?\s*([\d.,]+)\s*(mil)?/i
      );
      if (fipeMatch) {
        let raw = fipeMatch[1];
        if (fipeMatch[2]?.toLowerCase() === "mil") {
          fipePrice = parseFloat(raw.replace(",", ".")) * 1000;
        } else {
          raw = raw.replace(/\./g, "").replace(",", ".");
          const n = parseFloat(raw);
          if (!isNaN(n) && n >= 1000) fipePrice = n;
        }
        if (fipePrice != null) {
          await prisma.vehicle.update({ where: { id }, data: { fipePrice } });
        }
      }
    }

    const marginSetting = await prisma.setting.findUnique({
      where: { key: "profit_margin_percent" },
    });
    const margin = marginSetting ? parseFloat(marginSetting.value) : 10;

    // Smart pricing: if vehicle has good indicators and price is close to FIPE (within 12%),
    // use the original price (no margin) — operator negotiates later.
    // A margem de lucro de fato eh escolhida pelo operador no modal.
    let effectiveMargin = margin;
    if (fipePrice && vehicle.rawDescription) {
      const discount = 1 - (vehicle.price / fipePrice);
      const desc = vehicle.rawDescription.toLowerCase();
      const hasGoodIndicators =
        (vehicle.km < 60000) ||
        /\b(unico\s*dono|único\s*dono|procedencia|procedência|sem\s*detalhes|revisado|revisões|revisoes)\b/i.test(desc);
      const hasNoRedFlags =
        !/\b(leil[aã]o|sinistro|batido|enchente|recuperado)\b/i.test(desc);

      if (discount <= 0.12 && hasGoodIndicators && hasNoRedFlags) {
        effectiveMargin = 0;
        console.log(`[approve] Smart pricing: ${vehicle.model} - good car at ${Math.round(discount * 100)}% FIPE, using 0% margin`);
      }
    }

    const sellingPrice = vehicle.price * (1 + effectiveMargin / 100);

    let features: string[] = [];
    try { features = JSON.parse(vehicle.features || "[]"); } catch { features = []; }

    const vehicleData = {
      model: vehicle.model,
      brand: vehicle.brand,
      year: vehicle.year,
      yearModel: vehicle.yearModel,
      km: vehicle.km,
      price: vehicle.price,
      fipePrice,
      transmission: vehicle.transmission,
      fuel: vehicle.fuel,
      features,
      rawDescription: vehicle.rawDescription,
    };

    const formattedAd = formatVehicleAd(vehicleData, { profitMarginPercent: effectiveMargin });

    const updated = await prisma.vehicle.update({
      where: { id },
      data: {
        status: "APPROVED",
        sellingPrice,
        formattedAd,
        fipePrice,
        approvedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "VEHICLE_APPROVED",
        entityType: "Vehicle",
        entityId: id,
        vehicleId: id,
        userId: auth.user.id,
        details: JSON.stringify({
          margin,
          effectiveMargin,
          sellingPrice,
          originalPrice: vehicle.price,
        }),
      },
    });

    let parsedFeatures: string[] = [];
    let parsedPhotos: string[] = [];
    try { parsedFeatures = JSON.parse(updated.features || "[]"); } catch { /* */ }
    try { parsedPhotos = JSON.parse(updated.photos || "[]"); } catch { /* */ }

    return NextResponse.json({
      ...updated,
      features: parsedFeatures,
      photos: parsedPhotos,
    });
  } catch (error) {
    console.error("[Vehicles] Error approving vehicle:", error);
    return NextResponse.json(
      { error: "Erro ao aprovar veiculo" },
      { status: 500 }
    );
  }
}
