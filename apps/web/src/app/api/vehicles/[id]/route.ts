import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import {
  db,
  veiculos,
  gruposWhatsapp,
  historicoPublicacao,
  carimboDeEdicao,
  marcaDeExclusao,
  travaDeColisao,
  vivosE,
} from "@/lib/db";
import { registrarAuditoria } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { validateBody } from "@/lib/validate";
import { updateVehicleSchema } from "@/lib/validations";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;

    const [linha] = await db
      .select({
        v: veiculos,
        grupoNome: gruposWhatsapp.name,
        grupoJid: gruposWhatsapp.groupId,
      })
      .from(veiculos)
      .leftJoin(gruposWhatsapp, eq(gruposWhatsapp.groupId, veiculos.sourceGroupId))
      .where(vivosE(veiculos, eq(veiculos.id, id)))
      .limit(1);

    const historico = linha
      ? await db
          .select({
            post: historicoPublicacao,
            targetGroupName: gruposWhatsapp.name,
            targetGroupJid: gruposWhatsapp.groupId,
          })
          .from(historicoPublicacao)
          .leftJoin(
            gruposWhatsapp,
            eq(gruposWhatsapp.groupId, historicoPublicacao.targetGroupId)
          )
          .where(vivosE(historicoPublicacao, eq(historicoPublicacao.vehicleId, id)))
          .orderBy(desc(historicoPublicacao.postedAt))
      : [];

    // Mesma forma que a tela ja consome: sourceGroup e postHistory aninhados.
    const vehicle = linha
      ? {
          ...linha.v,
          sourceGroup: linha.grupoJid
            ? { name: linha.grupoNome as string, groupId: linha.grupoJid }
            : null,
          postHistory: historico.map((h) => ({
            ...h.post,
            targetGroup: h.targetGroupJid
              ? { name: h.targetGroupName as string, groupId: h.targetGroupJid }
              : null,
          })),
        }
      : null;

    if (!vehicle) {
      return NextResponse.json(
        { error: "Veiculo nao encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...vehicle,
      features: (() => { try { return JSON.parse(vehicle.features || "[]"); } catch { return []; } })(),
      photos: (() => { try { return JSON.parse(vehicle.photos || "[]"); } catch { return []; } })(),
    });
  } catch (error) {
    console.error("[Vehicles] Error fetching vehicle:", error);
    return NextResponse.json(
      { error: "Erro ao buscar veiculo" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const validation = validateBody(updateVehicleSchema, body);
    if (!validation.success) return validation.response;

    const [existing] = await db
      .select({ updatedAt: veiculos.updatedAt })
      .from(veiculos)
      .where(vivosE(veiculos, eq(veiculos.id, id)))
      .limit(1);
    if (!existing) {
      return NextResponse.json(
        { error: "Veiculo nao encontrado" },
        { status: 404 }
      );
    }

    const validated = validation.data;
    const data: Record<string, unknown> = {};

    if (validated.model !== undefined) data.model = validated.model;
    if (validated.brand !== undefined) data.brand = validated.brand;
    if (validated.year !== undefined) data.year = validated.year;
    if (validated.yearModel !== undefined) data.yearModel = validated.yearModel;
    if (validated.km !== undefined) data.km = validated.km;
    if (validated.price !== undefined) data.price = validated.price;
    if (validated.sellingPrice !== undefined) data.sellingPrice = validated.sellingPrice;
    if (validated.fipePrice !== undefined) data.fipePrice = validated.fipePrice;
    if (validated.transmission !== undefined) data.transmission = validated.transmission;
    if (validated.fuel !== undefined) data.fuel = validated.fuel;
    if (validated.color !== undefined) data.color = validated.color;
    if (validated.plate !== undefined) data.plate = validated.plate;
    if (validated.features !== undefined) data.features = JSON.stringify(validated.features);
    if (validated.photos !== undefined) data.photos = JSON.stringify(validated.photos);
    if (validated.rawDescription !== undefined) data.rawDescription = validated.rawDescription;
    if (validated.formattedAd !== undefined) data.formattedAd = validated.formattedAd;
    if (validated.status !== undefined) data.status = validated.status;

    const [vehicle] = await db
      .update(veiculos)
      .set({ ...data, ...carimboDeEdicao(auth.user.id) })
      .where(travaDeColisao(veiculos, id, body?.updatedAt ?? existing.updatedAt))
      .returning();

    if (!vehicle) {
      return NextResponse.json(
        { error: "Veiculo alterado por outro usuario. Recarregue a tela." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ...vehicle,
      features: (() => { try { return JSON.parse(vehicle.features || "[]"); } catch { return []; } })(),
      photos: (() => { try { return JSON.parse(vehicle.photos || "[]"); } catch { return []; } })(),
    });
  } catch (error) {
    console.error("[Vehicles] Error updating vehicle:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar veiculo" },
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

    const [existing] = await db
      .select({ id: veiculos.id })
      .from(veiculos)
      .where(vivosE(veiculos, eq(veiculos.id, id)))
      .limit(1);
    if (!existing) {
      return NextResponse.json(
        { error: "Veiculo nao encontrado" },
        { status: 404 }
      );
    }

    // Delete LOGICO, e a TRILHA NAO E TOCADA. O codigo antigo fazia
    // auditLog.deleteMany aqui: apagar o veiculo apagava junto a prova do que
    // foi feito com ele.
    await db
      .update(historicoPublicacao)
      .set(marcaDeExclusao(auth.user.id))
      .where(vivosE(historicoPublicacao, eq(historicoPublicacao.vehicleId, id)));

    await db
      .update(veiculos)
      .set(marcaDeExclusao(auth.user.id))
      .where(vivosE(veiculos, eq(veiculos.id, id)));

    await registrarAuditoria({
      action: "VEHICLE_DELETED",
      entityType: "Vehicle",
      entityId: id,
      vehicleId: id,
      userId: auth.user.id,
      request,
    });

    return NextResponse.json({ message: "Veiculo removido com sucesso" });
  } catch (error) {
    console.error("[Vehicles] Error deleting vehicle:", error);
    return NextResponse.json(
      { error: "Erro ao remover veiculo" },
      { status: 500 }
    );
  }
}
