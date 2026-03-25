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
      return NextResponse.json({
        ...vehicle,
        features: JSON.parse(vehicle.features),
        photos: JSON.parse(vehicle.photos),
      });
    }

    if (vehicle.status !== "PENDING") {
      return NextResponse.json(
        { error: `Veiculo nao pode ser aprovado no status ${vehicle.status}` },
        { status: 400 }
      );
    }

    const marginSetting = await prisma.setting.findUnique({
      where: { key: "profit_margin" },
    });
    const margin = marginSetting ? parseFloat(marginSetting.value) : 10;

    const sellingPrice = vehicle.price * (1 + margin / 100);

    const vehicleData = {
      model: vehicle.model,
      year: vehicle.year,
      yearModel: vehicle.yearModel,
      km: vehicle.km,
      price: vehicle.price,
      fipePrice: vehicle.fipePrice,
      transmission: vehicle.transmission,
      fuel: vehicle.fuel,
      features: JSON.parse(vehicle.features) as string[],
    };

    const formattedAd = formatVehicleAd(vehicleData, { profitMarginPercent: margin });

    const updated = await prisma.vehicle.update({
      where: { id },
      data: {
        status: "APPROVED",
        sellingPrice,
        formattedAd,
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
          sellingPrice,
          originalPrice: vehicle.price,
        }),
      },
    });

    return NextResponse.json({
      ...updated,
      features: JSON.parse(updated.features),
      photos: JSON.parse(updated.photos),
    });
  } catch (error) {
    console.error("[Vehicles] Error approving vehicle:", error);
    return NextResponse.json(
      { error: "Erro ao aprovar veiculo" },
      { status: 500 }
    );
  }
}
