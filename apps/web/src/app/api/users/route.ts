import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function GET() {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        _count: { select: { auditLogs: true } },
      },
      // Ativos primeiro, depois por nome (ordem estavel).
      // Inativos descem pro final mas mantem ordenacao alfabetica entre si.
      orderBy: [
        { active: "desc" },
        { name: "asc" },
      ],
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error("[Users] Error:", error);
    return NextResponse.json(
      { error: "Erro ao listar usuarios" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const body = await request.json();
    const { name, email, password, role } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Nome, email e senha sao obrigatorios" },
        { status: 400 }
      );
    }

    if (role && !["ADMIN", "OPERATOR"].includes(role)) {
      return NextResponse.json(
        { error: "Role deve ser ADMIN ou OPERATOR" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Email ja cadastrado" },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: role || "OPERATOR",
      },
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
        action: "USER_CREATED",
        entityType: "User",
        entityId: user.id,
        userId: auth.user.id,
        details: JSON.stringify({ name, email, role: role || "OPERATOR" }),
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error("[Users] Error creating user:", error);
    return NextResponse.json(
      { error: "Erro ao criar usuario" },
      { status: 500 }
    );
  }
}
