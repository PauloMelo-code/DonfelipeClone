import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;
  const { id } = await params;
  const body = await request.json();
  const data: Record<string, unknown> = {};
  if (typeof body?.name === "string") data.name = body.name.slice(0, 100);
  if (typeof body?.content === "string") data.content = body.content.slice(0, 2000);
  if (typeof body?.category === "string") data.category = body.category.slice(0, 50);
  if (typeof body?.shortcut === "string") data.shortcut = body.shortcut.slice(0, 20);
  const updated = await prisma.messageTemplate.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;
  const { id } = await params;
  await prisma.messageTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
