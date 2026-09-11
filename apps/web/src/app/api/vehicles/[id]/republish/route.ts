import { NextRequest, NextResponse } from "next/server";
import { and, eq, or, inArray, isNull, lt } from "drizzle-orm";
import { db, veiculos, carimboDeEdicao, vivos, vivosE } from "@/lib/db";
import { enfileirarPublicacao } from "@/lib/queue/publicacao";
import { requireAuth } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;

  // Atomic claim: lock vehicle to prevent double-click race.
  // Republish operates on PUBLISHED vehicles (and APPROVED transient state set below).
  const claim = await db
    .update(veiculos)
    .set({ publishingLockedAt: new Date(), ...carimboDeEdicao(auth.user.id) })
    .where(
      and(
        vivos(veiculos),
        eq(veiculos.id, id),
        inArray(veiculos.status, ["PUBLISHED", "APPROVED"]),
        or(
          isNull(veiculos.publishingLockedAt),
          lt(veiculos.publishingLockedAt, new Date(Date.now() - 5 * 60 * 1000)) // trava vencida em 5 min
        )
      )
    )
    .returning({ id: veiculos.id });

  if (claim.length === 0) {
    return NextResponse.json({ error: "Veiculo ja em processamento ou ja publicado" }, { status: 409 });
  }

  try {
    const [vehicle] = await db
      .select()
      .from(veiculos)
      .where(vivosE(veiculos, eq(veiculos.id, id)))
      .limit(1);

    if (!vehicle) {
      return NextResponse.json({ error: "Veiculo nao encontrado" }, { status: 404 });
    }

    if (vehicle.status !== "PUBLISHED") {
      return NextResponse.json(
        { error: `Apenas veiculos publicados podem ser reenviados. Status atual: ${vehicle.status}` },
        { status: 400 }
      );
    }

    let targetGroupIds: string[] | undefined;
    let formattedAd: string | undefined;
    let sellingPrice: number | undefined;
    let photos: string[] | undefined;
    try {
      const body = await request.json();
      targetGroupIds = body.targetGroupIds;
      formattedAd = body.formattedAd;
      sellingPrice = body.sellingPrice;
      if (Array.isArray(body.photos) && body.photos.length > 0) {
        photos = body.photos;
        // Persist edited photos sync antes do publish em background
        await db
          .update(veiculos)
          .set({ photos: JSON.stringify(photos), ...carimboDeEdicao(auth.user.id) })
          .where(vivosE(veiculos, eq(veiculos.id, id)))
          .catch(() => {});
      }
    } catch {
      // Body is optional
    }

    // Temporarily set APPROVED so publishVehicle can run
    await db
      .update(veiculos)
      .set({ status: "APPROVED", ...carimboDeEdicao(auth.user.id) })
      .where(vivosE(veiculos, eq(veiculos.id, id)));

    // Fire-and-forget: respond immediately, run republish in background.
    const userId = auth.user.id;
    const adForBg = formattedAd || vehicle.formattedAd || undefined;
    const priceForBg = sellingPrice || vehicle.sellingPrice || undefined;
    const photosForBg = photos;
    const ids = targetGroupIds;

    // Vai para a fila. `restaurarPublicado` devolve o status a PUBLISHED
    // quando nenhum envio deu certo, para o carro nao ficar preso em
    // APPROVED.
    await enfileirarPublicacao({
      vehicleId: id,
      targetGroupIds: ids,
      formattedAd: adForBg,
      sellingPrice: priceForBg,
      photos: photosForBg,
      userId,
      quickPublish: true,
      restaurarPublicado: true,
    });

    return NextResponse.json({
      message: "Reenvio enfileirado",
      status: "publishing",
      groupsPublished: targetGroupIds?.length ?? 0,
      groupsFailed: 0,
      groupsSkipped: 0,
      results: [],
    });
  } catch (error) {
    console.error("[Vehicles] Error republishing vehicle:", error);
    await db
      .update(veiculos)
      .set({ publishingLockedAt: null })
      .where(vivosE(veiculos, eq(veiculos.id, id)))
      .catch(() => {});
    return NextResponse.json({ error: "Erro ao reenviar veiculo" }, { status: 500 });
  }
}
