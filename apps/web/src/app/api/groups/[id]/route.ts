import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { validateBody } from "@/lib/validate";
import { updateGroupSchema } from "@/lib/validations";
import { invalidateGroupsCache } from "../route";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;
    const group = await prisma.whatsAppGroup.findUnique({ where: { id } });
    if (!group) {
      return NextResponse.json({ error: "Grupo nao encontrado" }, { status: 404 });
    }
    return NextResponse.json({
      ...group,
      filters: group.filters ? JSON.parse(group.filters) : null,
    });
  } catch (error) {
    console.error("[Groups] Error fetching group:", error);
    return NextResponse.json({ error: "Erro ao buscar grupo" }, { status: 500 });
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

    const group = await prisma.whatsAppGroup.findUnique({ where: { id } });
    if (!group) {
      return NextResponse.json({ error: "Grupo nao encontrado" }, { status: 404 });
    }

    const { name, role, active, filters, photoUrl, region } = validation.data;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (role !== undefined) data.role = role;
    if (active !== undefined) data.active = active;
    if (filters !== undefined) data.filters = filters;
    if (photoUrl !== undefined) data.photoUrl = photoUrl;
    if (region !== undefined) data.region = region;

    const updated = await prisma.whatsAppGroup.update({
      where: { id },
      data,
    });

    invalidateGroupsCache();

    return NextResponse.json({
      ...updated,
      filters: updated.filters ? JSON.parse(updated.filters) : null,
    });
  } catch (error) {
    console.error("[Groups] Error updating group:", error);
    return NextResponse.json({ error: "Erro ao atualizar grupo" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;
    const group = await prisma.whatsAppGroup.findUnique({ where: { id } });
    if (!group) {
      return NextResponse.json({ error: "Grupo nao encontrado" }, { status: 404 });
    }

    // Unlink vehicles and posts before deleting
    await prisma.vehicle.updateMany({ where: { sourceGroupId: group.groupId }, data: { sourceGroupId: null } });
    await prisma.postHistory.deleteMany({ where: { targetGroupId: group.groupId } });

    await prisma.whatsAppGroup.delete({ where: { id } });
    invalidateGroupsCache();
    return NextResponse.json({ message: "Grupo removido com sucesso" });
  } catch (error) {
    console.error("[Groups] Error deleting group:", error);
    return NextResponse.json({ error: "Erro ao remover grupo" }, { status: 500 });
  }
}
