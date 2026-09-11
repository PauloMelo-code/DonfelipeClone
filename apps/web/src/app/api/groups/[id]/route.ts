import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  db,
  gruposWhatsapp,
  historicoPublicacao,
  carimboDeEdicao,
  marcaDeExclusao,
  travaDeColisao,
  vivosE,
} from "@/lib/db";
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
    const [group] = await db
      .select()
      .from(gruposWhatsapp)
      .where(vivosE(gruposWhatsapp, eq(gruposWhatsapp.id, id)))
      .limit(1);
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

    const { name, role, active, filters, photoUrl, region, kindOverride } = validation.data;
    const data: Record<string, unknown> = {};
    if (name !== undefined) {
      data.name = name;
      // Edicao manual de nome trava contra sobrescrita do sync
      data.nameLocked = true;
    }
    if (role !== undefined) data.role = role;
    if (active !== undefined) data.active = active;
    if (filters !== undefined) data.filters = filters;
    if (photoUrl !== undefined) data.photoUrl = photoUrl;
    if (region !== undefined) data.region = region;
    // kindOverride: null remove o override (volta classificacao automatica)
    if (kindOverride !== undefined) {
      data.kindOverride = kindOverride ?? null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
    }

    const [updated] = await db
      .update(gruposWhatsapp)
      .set({ ...data, ...carimboDeEdicao(auth.user.id) })
      .where(travaDeColisao(gruposWhatsapp, id, body?.updatedAt))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Grupo alterado por outro usuario ou nao encontrado. Recarregue a tela." },
        { status: 409 }
      );
    }

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
    const [group] = await db
      .select({ groupId: gruposWhatsapp.groupId })
      .from(gruposWhatsapp)
      .where(vivosE(gruposWhatsapp, eq(gruposWhatsapp.id, id)))
      .limit(1);
    if (!group) {
      return NextResponse.json({ error: "Grupo nao encontrado" }, { status: 404 });
    }

    // Delete LOGICO. A linha continua no banco, entao a FK dos veiculos segue
    // valida e a procedencia de cada carro fica preservada -- antes o codigo
    // zerava vehicles.sourceGroupId e apagava o historico de publicacao para
    // conseguir remover a linha.
    await db
      .update(historicoPublicacao)
      .set(marcaDeExclusao(auth.user.id))
      .where(vivosE(historicoPublicacao, eq(historicoPublicacao.targetGroupId, group.groupId)));

    await db
      .update(gruposWhatsapp)
      .set(marcaDeExclusao(auth.user.id))
      .where(vivosE(gruposWhatsapp, eq(gruposWhatsapp.id, id)));

    invalidateGroupsCache();
    return NextResponse.json({ message: "Grupo removido com sucesso" });
  } catch (error) {
    console.error("[Groups] Error deleting group:", error);
    return NextResponse.json({ error: "Erro ao remover grupo" }, { status: 500 });
  }
}
