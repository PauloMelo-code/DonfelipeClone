import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, role, active } = body;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Usuario nao encontrado" },
        { status: 404 }
      );
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (role !== undefined) {
      if (!["ADMIN", "OPERATOR"].includes(role)) {
        return NextResponse.json(
          { error: "Role deve ser ADMIN ou OPERATOR" },
          { status: 400 }
        );
      }
      data.role = role;
    }
    if (active !== undefined) data.active = active;

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "USER_UPDATED",
        entityType: "User",
        entityId: id,
        userId: auth.user.id,
        details: JSON.stringify(data),
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("[Users] Error updating user:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar usuario" },
      { status: 500 }
    );
  }
}
