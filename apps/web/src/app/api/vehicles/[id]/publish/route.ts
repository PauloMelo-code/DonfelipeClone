import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publishVehicle } from "@/lib/publisher";
import { requireAuth } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;

  // Atomic claim: lock vehicle to prevent double-click race
  const claim = await prisma.vehicle.updateMany({
    where: {
      id,
      status: { in: ["PENDING", "APPROVED"] },
      OR: [
        { publishingLockedAt: null },
        { publishingLockedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) } }, // 5 min stale lock
      ],
    },
    data: { publishingLockedAt: new Date() },
  });

  if (claim.count === 0) {
    return NextResponse.json({ error: "Veiculo ja em processamento ou ja publicado" }, { status: 409 });
  }

  try {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
    });

    if (!vehicle) {
      return NextResponse.json(
        { error: "Veiculo nao encontrado" },
        { status: 404 }
      );
    }

    if (vehicle.status !== "APPROVED") {
      return NextResponse.json(
        {
          error: `Veiculo precisa estar aprovado para publicar. Status atual: ${vehicle.status}`,
        },
        { status: 400 }
      );
    }

    if (!vehicle.formattedAd) {
      return NextResponse.json(
        { error: "Veiculo nao possui anuncio formatado" },
        { status: 400 }
      );
    }

    // Parse optional body params
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
        // Persist as ja, sincrono, antes do publish em background.
        // Isso garante que o "Publicados" mostra a foto editada e que
        // futuras republicacoes/visualizacoes peguem o estado correto.
        await prisma.vehicle.update({
          where: { id },
          data: { photos: JSON.stringify(photos) },
        }).catch(() => {});
      }
      console.log(
        `[publish] vehicle=${id} body.photos=${photos ? `[${photos.length}, first=${photos[0]?.slice(0, 30)}...]` : "MISSING"} ad=${formattedAd ? "yes" : "no"} price=${sellingPrice ?? "no"} groups=${targetGroupIds?.length ?? 0}`
      );
    } catch {
      // Body is optional
    }

    // Fire-and-forget direto via Promise. Em deploys Docker/Easypanel o
    // after() do next/server pode nao executar -- a request retorna 200 mas
    // o callback eh descartado. Promise solta funciona em qualquer Node.
    const userId = auth.user.id;
    void (async () => {
      try {
        await publishVehicle(id, {
          targetGroupIds,
          formattedAd,
          sellingPrice,
          photos,
          userId,
          quickPublish: true,
        });
      } catch (err) {
        console.error("[Vehicles] Background publish failed:", err);
      } finally {
        await prisma.vehicle
          .update({ where: { id }, data: { publishingLockedAt: null } })
          .catch(() => {});
      }
    })();

    return NextResponse.json({
      message: "Publicacao enfileirada",
      status: "publishing",
      groupsPublished: targetGroupIds?.length ?? 0,
      groupsFailed: 0,
      results: [],
    });
  } catch (error) {
    console.error("[Vehicles] Error publishing vehicle:", error);
    await prisma.vehicle
      .update({ where: { id }, data: { publishingLockedAt: null } })
      .catch(() => {});
    return NextResponse.json(
      { error: "Erro ao publicar veiculo" },
      { status: 500 }
    );
  }
}
