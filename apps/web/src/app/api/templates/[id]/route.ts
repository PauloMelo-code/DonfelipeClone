import { NextRequest, NextResponse } from "next/server";
import {
  db,
  modelosMensagem,
  carimboDeEdicao,
  marcaDeExclusao,
  travaDeColisao,
} from "@/lib/db";
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

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
  }

  const [updated] = await db
    .update(modelosMensagem)
    .set({ ...data, ...carimboDeEdicao(auth.user.id) })
    .where(travaDeColisao(modelosMensagem, id, body?.updatedAt))
    .returning();

  if (!updated) {
    return NextResponse.json(
      { error: "Registro alterado por outro usuario ou nao encontrado. Recarregue a tela." },
      { status: 409 }
    );
  }
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;
  const { id } = await params;

  // Delete LOGICO. Nunca db.delete nesta base.
  const [removido] = await db
    .update(modelosMensagem)
    .set(marcaDeExclusao(auth.user.id))
    .where(travaDeColisao(modelosMensagem, id))
    .returning({ id: modelosMensagem.id });

  if (!removido) {
    return NextResponse.json({ error: "Template nao encontrado" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
