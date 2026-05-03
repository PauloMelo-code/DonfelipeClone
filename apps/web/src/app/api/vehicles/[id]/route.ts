import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { validateBody } from "@/lib/validate";
import { updateVehicleSchema } from "@/lib/validations";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: {
        sourceGroup: { select: { name: true, groupId: true } },
        postHistory: {
          include: {
            targetGroup: { select: { name: true, groupId: true } },
          },
          orderBy: { postedAt: "desc" },
        },
      },
    });

    if (!vehicle) {
      return NextResponse.json(
        { error: "Veiculo nao encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...vehicle,
      features: (() => { try { return JSON.parse(vehicle.features || "[]"); } catch { return []; } })(),
      photos: (() => { try { return JSON.parse(vehicle.photos || "[]"); } catch { return []; } })(),
    });
  } catch (error) {
    console.error("[Vehicles] Error fetching vehicle:", error);
    return NextResponse.json(
      { error: "Erro ao buscar veiculo" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const validation = validateBody(updateVehicleSchema, body);
    if (!validation.success) return validation.response;

    const existing = await prisma.vehicle.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Veiculo nao encontrado" },
        { status: 404 }
      );
    }

    const validated = validation.data;
    const data: Record<string, unknown> = {};

    if (validated.model !== undefined) data.model = validated.model;
    if (validated.brand !== undefined) data.brand = validated.brand;
    if (validated.year !== undefined) data.year = validated.year;
    if (validated.yearModel !== undefined) data.yearModel = validated.yearModel;
    if (validated.km !== undefined) data.km = validated.km;
    if (validated.price !== undefined) data.price = validated.price;
    if (validated.sellingPrice !== undefined) data.sellingPrice = validated.sellingPrice;
    if (validated.fipePrice !== undefined) data.fipePrice = validated.fipePrice;
    if (validated.transmission !== undefined) data.transmission = validated.transmission;
    if (validated.fuel !== undefined) data.fuel = validated.fuel;
    if (validated.color !== undefined) data.color = validated.color;
    if (validated.plate !== undefined) data.plate = validated.plate;
    if (validated.features !== undefined) data.features = JSON.stringify(validated.features);
    if (validated.photos !== undefined) data.photos = JSON.stringify(validated.photos);
    if (validated.rawDescription !== undefined) data.rawDescription = validated.rawDescription;
    if (validated.formattedAd !== undefined) data.formattedAd = validated.formattedAd;
    if (validated.status !== undefined) data.status = validated.status;

    const vehicle = await prisma.vehicle.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      ...vehicle,
      features: (() => { try { return JSON.parse(vehicle.features || "[]"); } catch { return []; } })(),
      photos: (() => { try { return JSON.parse(vehicle.photos || "[]"); } catch { return []; } })(),
    });
  } catch (error) {
    console.error("[Vehicles] Error updating vehicle:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar veiculo" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;

    const existing = await prisma.vehicle.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Veiculo nao encontrado" },
        { status: 404 }
      );
    }

    await prisma.postHistory.deleteMany({ where: { vehicleId: id } });
    await prisma.auditLog.deleteMany({ where: { vehicleId: id } });
    await prisma.vehicle.delete({ where: { id } });

    return NextResponse.json({ message: "Veiculo removido com sucesso" });
  } catch (error) {
    console.error("[Vehicles] Error deleting vehicle:", error);
    return NextResponse.json(
      { error: "Erro ao remover veiculo" },
      { status: 500 }
    );
  }
}
