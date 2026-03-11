import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { validateBody } from "@/lib/validate";
import { updateGroupSchema } from "@/lib/validations";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;

    const group = await prisma.whatsAppGroup.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            sourceVehicles: true,
            targetPosts: true,
          },
        },
      },
    });

    if (!group) {
      return NextResponse.json(
        { error: "Grupo nao encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...group,
      filters: group.filters ? JSON.parse(group.filters) : null,
    });
  } catch (error) {
    console.error("[Groups] Error fetching group:", error);
    return NextResponse.json(
      { error: "Erro ao buscar grupo" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const validation = validateBody(updateGroupSchema, body);
    if (!validation.success) return validation.response;

    const existing = await prisma.whatsAppGroup.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Grupo nao encontrado" },
        { status: 404 }
      );
    }

    const validated = validation.data;
    const data: Record<string, unknown> = {};

    if (validated.name !== undefined) data.name = validated.name;
    if (validated.role !== undefined) data.role = validated.role;
    if (validated.active !== undefined) data.active = validated.active;
    if (validated.filters !== undefined)
      data.filters = validated.filters || null;
    if (validated.photoUrl !== undefined) data.photoUrl = validated.photoUrl;

    const group = await prisma.whatsAppGroup.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      ...group,
      filters: group.filters ? JSON.parse(group.filters) : null,
    });
  } catch (error) {
    console.error("[Groups] Error updating group:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar grupo" },
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

    const existing = await prisma.whatsAppGroup.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Grupo nao encontrado" },
        { status: 404 }
      );
    }

    const linkedVehicles = await prisma.vehicle.count({
      where: { sourceGroupId: existing.groupId },
    });

    const linkedPosts = await prisma.postHistory.count({
      where: { targetGroupId: existing.groupId },
    });

    if (linkedVehicles > 0 || linkedPosts > 0) {
      return NextResponse.json(
        {
          error:
            "Grupo possui veiculos ou publicacoes vinculadas. Desative o grupo ao inves de remove-lo.",
          linkedVehicles,
          linkedPosts,
        },
        { status: 400 }
      );
    }

    await prisma.whatsAppGroup.delete({ where: { id } });

    return NextResponse.json({ message: "Grupo removido com sucesso" });
  } catch (error) {
    console.error("[Groups] Error deleting group:", error);
    return NextResponse.json(
      { error: "Erro ao remover grupo" },
      { status: 500 }
    );
  }
}
