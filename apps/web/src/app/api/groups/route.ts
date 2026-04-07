import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { validateBody } from "@/lib/validate";
import { createGroupSchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");
    const active = searchParams.get("active");

    const where: Record<string, unknown> = {};

    if (role && role !== "ALL") {
      where.role = role;
    }

    if (active !== null && active !== undefined && active !== "") {
      where.active = active === "true";
    }

    const groups = await prisma.whatsAppGroup.findMany({
      where,
      include: {
        _count: {
          select: {
            sourceVehicles: true,
            targetPosts: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const parsed = groups.map((g) => ({
      ...g,
      filters: g.filters ? JSON.parse(g.filters) : null,
    }));

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("[Groups] Error listing groups:", error);
    return NextResponse.json(
      { error: "Erro ao listar grupos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const body = await request.json();
    const validation = validateBody(createGroupSchema, body);
    if (!validation.success) return validation.response;

    const { groupId, name, role, active, filters, photoUrl, region } = validation.data;

    const existing = await prisma.whatsAppGroup.findUnique({
      where: { groupId },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Grupo ja cadastrado", existingId: existing.id },
        { status: 409 }
      );
    }

    const group = await prisma.whatsAppGroup.create({
      data: {
        groupId,
        name,
        role,
        active: active ?? true,
        filters: filters || null,
        photoUrl,
        region: region || null,
      },
    });

    return NextResponse.json(
      {
        ...group,
        filters: group.filters ? JSON.parse(group.filters) : null,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Groups] Error creating group:", error);
    return NextResponse.json(
      { error: "Erro ao criar grupo" },
      { status: 500 }
    );
  }
}
