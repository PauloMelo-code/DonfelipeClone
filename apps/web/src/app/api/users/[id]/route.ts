import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, password, role, active } = body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json(
        { error: "Usuario nao encontrado" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) {
      if (!["ADMIN", "OPERATOR"].includes(role)) {
        return NextResponse.json(
          { error: "Role invalido. Use ADMIN ou OPERATOR" },
          { status: 400 }
        );
      }
      updateData.role = role;
    }
    if (active !== undefined) updateData.active = active;
    if (password && password.trim()) {
      updateData.password = await bcrypt.hash(password.trim(), 10);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Nenhum campo para atualizar" },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
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
        details: JSON.stringify({
          updatedFields: Object.keys(updateData).filter((k) => k !== "password"),
        }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[Users] Error updating user:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar usuario" },
      { status: 500 }
    );
  }
}
