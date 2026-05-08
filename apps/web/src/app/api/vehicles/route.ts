import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateVehicleHash } from "@/lib/deduplication";
import { requireAuth } from "@/lib/auth";
import { validateBody } from "@/lib/validate";
import { createVehicleSchema } from "@/lib/validations";

const ALLOWED_SORT_FIELDS = [
  "capturedAt",
  "price",
  "km",
  "year",
  "model",
  "status",
  "approvedAt",
  "publishedAt",
  "preparedAt",
];

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    // prepared filter:
    //   "true"  -> apenas veiculos com preparedAt != null (aba "Prontos")
    //   "false" -> apenas com preparedAt == null (aba "Aprovados" sem os prontos)
    //   absent  -> sem filtro
    const preparedParam = searchParams.get("prepared");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const sortBy = ALLOWED_SORT_FIELDS.includes(searchParams.get("sortBy") || "")
      ? searchParams.get("sortBy")!
      : "capturedAt";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

    const where: Record<string, unknown> = {};

    if (status && status !== "ALL") {
      where.status = status;
    }

    if (preparedParam === "true") {
      where.preparedAt = { not: null };
    } else if (preparedParam === "false") {
      where.preparedAt = null;
    }

    if (search) {
      where.OR = [
        { model: { contains: search } },
        { brand: { contains: search } },
        { plate: { contains: search } },
        { rawDescription: { contains: search } },
      ];
    }

    const [vehicles, total] = await Promise.all([
      prisma.vehicle.findMany({
        where,
        include: {
          sourceGroup: { select: { name: true, groupId: true, isCommunity: true, isAnnounce: true, ownerPhone: true, region: true } },
          _count: { select: { postHistory: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.vehicle.count({ where }),
    ]);

    const safeParseArray = (s: string | null | undefined): unknown[] => {
      if (!s) return [];
      try { return JSON.parse(s); } catch { return []; }
    };
    const parsed = vehicles.map((v) => ({
      ...v,
      features: safeParseArray(v.features),
      photos: safeParseArray(v.photos),
    }));

    return NextResponse.json({
      vehicles: parsed,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[Vehicles] Error listing vehicles:", error);
    return NextResponse.json(
      { error: "Erro ao listar veiculos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const body = await request.json();
    const validation = validateBody(createVehicleSchema, body);
    if (!validation.success) return validation.response;

    const {
      model,
      brand,
      year,
      yearModel,
      km,
      price,
      sellingPrice,
      fipePrice,
      transmission,
      fuel,
      color,
      plate,
      features,
      photos,
      rawDescription,
      sourceGroupId,
      sourceMessageId,
      sellerPhone,
    } = validation.data;

    const vehicleHash = generateVehicleHash({
      model,
      year,
      km,
      price,
    });

    const existing = await prisma.vehicle.findFirst({
      where: { vehicleHash },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Veiculo duplicado detectado", existingId: existing.id },
        { status: 409 }
      );
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        model,
        brand,
        year,
        yearModel: yearModel || year,
        km,
        price,
        sellingPrice,
        fipePrice,
        transmission,
        fuel,
        color,
        plate,
        features: JSON.stringify(features || []),
        photos: JSON.stringify(photos || []),
        rawDescription,
        sourceGroupId,
        sourceMessageId,
        sellerPhone,
        vehicleHash,
        status: "PENDING",
      },
    });

    return NextResponse.json(vehicle, { status: 201 });
  } catch (error) {
    console.error("[Vehicles] Error creating vehicle:", error);
    return NextResponse.json(
      { error: "Erro ao criar veiculo" },
      { status: 500 }
    );
  }
}
