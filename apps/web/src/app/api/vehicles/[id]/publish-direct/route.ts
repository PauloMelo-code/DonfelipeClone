import { NextRequest, NextResponse } from "next/server";
import { and, eq, or, inArray, isNull, lt } from "drizzle-orm";
import { db, veiculos, gruposWhatsapp, carimboDeEdicao, vivos, vivosE } from "@/lib/db";

/** Grupos TARGET ativos e vivos, com um filtro extra opcional. */
async function destinos(extra?: import("drizzle-orm").SQL) {
  return db
    .select()
    .from(gruposWhatsapp)
    .where(
      vivosE(gruposWhatsapp, eq(gruposWhatsapp.role, "TARGET"), eq(gruposWhatsapp.active, true), extra)
    );
}
import { prepararAprovacao } from "@/lib/actions/veiculos";
import { requireAuth } from "@/lib/auth";
import { enfileirarPublicacao } from "@/lib/queue/publicacao";

/**
 * POST /api/vehicles/[id]/publish-direct
 * Fast-track: aprova (se PENDING) e publica direto nos grupos da regiao do veiculo.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;

  // Atomic claim: lock vehicle to prevent double-click race
  const claim = await db
    .update(veiculos)
    .set({ publishingLockedAt: new Date(), ...carimboDeEdicao(auth.user.id) })
    .where(
      and(
        vivos(veiculos),
        eq(veiculos.id, id),
        inArray(veiculos.status, ["PENDING", "APPROVED"]),
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
    const body = await request.json().catch(() => ({}));
    const requestedGroupIds: string[] | undefined = Array.isArray(body?.targetGroupIds) ? body.targetGroupIds : undefined;
    // Modal envia o texto/preco editados. Se vierem, usamos eles em vez de
    // regenerar do rawDescription -- senao a edicao manual era perdida.
    const userEditedAd: string | undefined = typeof body?.formattedAd === "string" && body.formattedAd.trim()
      ? body.formattedAd
      : undefined;
    const userEditedPrice: number | undefined = typeof body?.sellingPrice === "number" && body.sellingPrice > 0
      ? body.sellingPrice
      : undefined;
    // Fotos editadas pelo modal (recortadas/borradas). CRITICAL: salvamos no
    // DB antes da publicacao em background pra evitar race condition entre
    // o PUT do frontend e o publish, que estava fazendo as fotos originais
    // (com placa visivel) irem pros grupos.
    const userEditedPhotos: string[] | undefined =
      Array.isArray(body?.photos) && body.photos.length > 0 ? body.photos : undefined;
    console.log(
      `[publish-direct] vehicle=${id} body.photos=${userEditedPhotos ? `[${userEditedPhotos.length}, first=${userEditedPhotos[0]?.slice(0, 30)}...]` : "MISSING"} ad=${userEditedAd ? "yes" : "no"} price=${userEditedPrice ?? "no"} groups=${requestedGroupIds?.length ?? 0}`
    );
    if (userEditedPhotos) {
      await db
        .update(veiculos)
        .set({ photos: JSON.stringify(userEditedPhotos), ...carimboDeEdicao(auth.user.id) })
        .where(vivosE(veiculos, eq(veiculos.id, id)))
        .catch(() => {});
    }

    const [vehicle] = await db
      .select()
      .from(veiculos)
      .where(vivosE(veiculos, eq(veiculos.id, id)))
      .limit(1);
    if (!vehicle) {
      return NextResponse.json({ error: "Veiculo nao encontrado" }, { status: 404 });
    }

    // Variables that may be set during auto-approve, used later for publish
    let formattedAd: string | undefined;
    let sellingPrice: number | undefined;

    // Auto-aprovar se PENDING. FIPE, precificacao e anuncio vem de
    // lib/actions/veiculos: era copia do approve/route.ts, e as duas
    // versoes ja tinham divergido no reconhecimento de "procedência".
    if (vehicle.status === "PENDING") {
      const aprovacao = await prepararAprovacao(vehicle, {
        precoEditado: userEditedPrice,
        anuncioEditado: userEditedAd,
      });
      sellingPrice = aprovacao.sellingPrice;
      formattedAd = aprovacao.formattedAd;
      const fipePrice = aprovacao.fipePrice;

      await db
        .update(veiculos)
        .set({
          status: "APPROVED",
          sellingPrice,
          formattedAd,
          fipePrice,
          approvedAt: new Date(),
          ...carimboDeEdicao(auth.user.id),
        })
        .where(vivosE(veiculos, eq(veiculos.id, id)));
    } else {
      // Vehicle already APPROVED -- usa edits do body se vieram, senao pega do DB
      formattedAd = userEditedAd ?? vehicle.formattedAd ?? undefined;
      sellingPrice = userEditedPrice ?? vehicle.sellingPrice ?? undefined;

      // Se houve edicao no modal, persiste no DB pra ficar consistente
      if (userEditedAd || userEditedPrice) {
        await db
          .update(veiculos)
          .set({
            ...(userEditedAd ? { formattedAd: userEditedAd } : {}),
            ...(userEditedPrice ? { sellingPrice: userEditedPrice } : {}),
            ...carimboDeEdicao(auth.user.id),
          })
          .where(vivosE(veiculos, eq(veiculos.id, id)));
      }
    }

    // Selecionar grupos destino: usar requestedGroupIds se fornecido, senao auto-selecionar por estado
    let targetGroups;
    if (requestedGroupIds && requestedGroupIds.length > 0) {
      targetGroups = await destinos(inArray(gruposWhatsapp.groupId, requestedGroupIds));
    } else if (vehicle.state) {
      targetGroups = await destinos(eq(gruposWhatsapp.region, vehicle.state));
      // Fallback: se nao tem grupos da regiao, usa todos
      if (targetGroups.length === 0) {
        targetGroups = await destinos();
      }
    } else {
      targetGroups = await destinos();
    }

    if (targetGroups.length === 0) {
      return NextResponse.json({ error: "Nenhum grupo destino configurado" }, { status: 400 });
    }

    // Fire-and-forget: respond immediately, run publish + audit in background.
    const userId = auth.user.id;
    const groupIds = targetGroups.map((g) => g.groupId);
    const groupCount = targetGroups.length;
    const sourceState = vehicle.state;
    const adForBg = formattedAd;
    const priceForBg = sellingPrice;
    const photosForBg = userEditedPhotos;

    // Vai para a fila. A trilha do disparo direto e gravada pelo worker,
    // ja com o resultado real do envio.
    await enfileirarPublicacao({
      vehicleId: id,
      targetGroupIds: groupIds,
      userId,
      formattedAd: adForBg,
      sellingPrice: priceForBg,
      photos: photosForBg,
      quickPublish: true,
      trilha: {
        action: "VEHICLE_PUBLISHED_DIRECT",
        triggeredBy: "fast-track",
        sourceState,
        destinationGroups: groupCount,
      },
    });

    return NextResponse.json({
      status: "publishing",
      sourceState: vehicle.state,
      destinationGroups: targetGroups.length,
      totalSent: 0,
      totalFailed: 0,
      totalSkipped: 0,
      results: [],
    });
  } catch (error) {
    console.error("[publish-direct] Error:", error);
    await db
      .update(veiculos)
      .set({ publishingLockedAt: null })
      .where(vivosE(veiculos, eq(veiculos.id, id)))
      .catch(() => {});
    return NextResponse.json({ error: "Erro ao publicar direto" }, { status: 500 });
  }
}
