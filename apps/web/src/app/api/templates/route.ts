import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db, modelosMensagem, vivos } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const templates = await db
    .select()
    .from(modelosMensagem)
    .where(vivos(modelosMensagem))
    .orderBy(asc(modelosMensagem.category), asc(modelosMensagem.name));

  return NextResponse.json(templates);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;
  try {
    const body = await request.json();
    const name = String(body?.name || "").trim().slice(0, 100);
    const content = String(body?.content || "").trim().slice(0, 2000);
    const category = body?.category ? String(body.category).trim().slice(0, 50) : null;
    const shortcut = body?.shortcut ? String(body.shortcut).trim().slice(0, 20) : null;
    if (!name || !content) {
      return NextResponse.json({ error: "Nome e conteudo obrigatorios" }, { status: 400 });
    }

    const [t] = await db
      .insert(modelosMensagem)
      .values({ name, content, category, shortcut, modifiedBy: auth.user.id })
      .returning();

    return NextResponse.json(t, { status: 201 });
  } catch (error) {
    console.error("[templates] POST error:", error);
    return NextResponse.json({ error: "Erro ao criar template" }, { status: 500 });
  }
}
