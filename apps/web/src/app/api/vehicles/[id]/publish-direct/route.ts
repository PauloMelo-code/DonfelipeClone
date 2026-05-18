import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { formatVehicleAd } from "@/lib/vehicle-formatter";
import { publishVehicle } from "@/lib/publisher";

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
      await prisma.vehicle.update({
        where: { id },
        data: { photos: JSON.stringify(userEditedPhotos) },
      }).catch(() => {});
    }

    const vehicle = await prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) {
      return NextResponse.json({ error: "Veiculo nao encontrado" }, { status: 404 });
    }

    // Variables that may be set during auto-approve, used later for publish
    let formattedAd: string | undefined;
    let sellingPrice: number | undefined;

    // Auto-aprovar se PENDING (replica logica do approve/route.ts)
    if (vehicle.status === "PENDING") {
      // Auto-extract FIPE
      let fipePrice = vehicle.fipePrice;
      if (fipePrice == null && vehicle.rawDescription) {
        const m = vehicle.rawDescription.match(/fipe\s*:?\s*r?\$?\s*([\d.,]+)\s*(mil)?/i);
        if (m) {
          let raw = m[1];
          if (m[2]?.toLowerCase() === "mil") {
            fipePrice = parseFloat(raw.replace(",", ".")) * 1000;
          } else {
            raw = raw.replace(/\./g, "").replace(",", ".");
            const n = parseFloat(raw);
            if (!isNaN(n) && n >= 1000) fipePrice = n;
          }
        }
      }

      const marginSetting = await prisma.setting.findUnique({ where: { key: "profit_margin_percent" } });
      const margin = marginSetting ? parseFloat(marginSetting.value) : 10;
      const minMarginSetting = await prisma.setting.findUnique({ where: { key: "min_profit_margin" } });
      const minMargin = minMarginSetting ? parseFloat(minMarginSetting.value) : 9;

      // Smart pricing -- reduz a margem mas nunca abaixo do minimo de lucro
      let effectiveMargin = margin;
      if (fipePrice && vehicle.rawDescription) {
        const discount = 1 - (vehicle.price / fipePrice);
        const desc = vehicle.rawDescription.toLowerCase();
        const hasGoodIndicators = vehicle.km < 60000 || /\b(unico\s*dono|único\s*dono|procedencia|sem\s*detalhes|revisado|revisões|revisoes)\b/i.test(desc);
        const hasNoRedFlags = !/\b(leil[aã]o|sinistro|batido|enchente|recuperado)\b/i.test(desc);
        if (discount <= 0.12 && hasGoodIndicators && hasNoRedFlags) effectiveMargin = minMargin;
      }
      // Piso de seguranca: nunca abaixo da margem minima de lucro
      if (effectiveMargin < minMargin) effectiveMargin = minMargin;

      // Preco: usa o editado pelo operador no modal se vier, senao calcula da margem
      sellingPrice = userEditedPrice ?? vehicle.price * (1 + effectiveMargin / 100);

      let features: string[] = [];
      try { features = JSON.parse(vehicle.features || "[]"); } catch {}

      // Texto: usa o editado pelo operador se vier, senao gera do rawDescription
      formattedAd = userEditedAd ?? formatVehicleAd({
        model: vehicle.model, brand: vehicle.brand, year: vehicle.year,
        yearModel: vehicle.yearModel, km: vehicle.km, price: vehicle.price,
        fipePrice, transmission: vehicle.transmission, fuel: vehicle.fuel,
        features, rawDescription: vehicle.rawDescription,
      }, { profitMarginPercent: effectiveMargin });

      await prisma.vehicle.update({
        where: { id },
        data: { status: "APPROVED", sellingPrice, formattedAd, fipePrice, approvedAt: new Date() },
      });
    } else {
      // Vehicle already APPROVED -- usa edits do body se vieram, senao pega do DB
      formattedAd = userEditedAd ?? vehicle.formattedAd ?? undefined;
      sellingPrice = userEditedPrice ?? vehicle.sellingPrice ?? undefined;

      // Se houve edicao no modal, persiste no DB pra ficar consistente
      if (userEditedAd || userEditedPrice) {
        await prisma.vehicle.update({
          where: { id },
          data: {
            ...(userEditedAd ? { formattedAd: userEditedAd } : {}),
            ...(userEditedPrice ? { sellingPrice: userEditedPrice } : {}),
          },
        });
      }
    }

    // Selecionar grupos destino: usar requestedGroupIds se fornecido, senao auto-selecionar por estado
    let targetGroups;
    if (requestedGroupIds && requestedGroupIds.length > 0) {
      targetGroups = await prisma.whatsAppGroup.findMany({
        where: { role: "TARGET", active: true, groupId: { in: requestedGroupIds } },
      });
    } else if (vehicle.state) {
      targetGroups = await prisma.whatsAppGroup.findMany({
        where: { role: "TARGET", active: true, region: vehicle.state },
      });
      // Fallback: se nao tem grupos da regiao, usa todos
      if (targetGroups.length === 0) {
        targetGroups = await prisma.whatsAppGroup.findMany({
          where: { role: "TARGET", active: true },
        });
      }
    } else {
      targetGroups = await prisma.whatsAppGroup.findMany({
        where: { role: "TARGET", active: true },
      });
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

    void (async () => {
      try {
        const results = await publishVehicle(id, {
          targetGroupIds: groupIds,
          userId,
          formattedAd: adForBg,
          sellingPrice: priceForBg,
          photos: photosForBg,
          quickPublish: true,
        });

        const totalSent = results.filter((r) => r.success).length;
        const totalFailed = results.filter((r) => !r.success && !r.skippedReason).length;
        const totalSkipped = results.filter((r) => !!r.skippedReason).length;

        await prisma.auditLog.create({
          data: {
            action: "VEHICLE_PUBLISHED_DIRECT",
            entityType: "Vehicle",
            entityId: id,
            vehicleId: id,
            userId,
            details: JSON.stringify({
              triggeredBy: "fast-track",
              sourceState,
              destinationGroups: groupCount,
              totalSent,
              totalFailed,
              totalSkipped,
            }),
          },
        }).catch(() => {});
      } catch (err) {
        console.error("[publish-direct] Background publish failed:", err);
      } finally {
        await prisma.vehicle
          .update({ where: { id }, data: { publishingLockedAt: null } })
          .catch(() => {});
      }
    })();

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
    await prisma.vehicle
      .update({ where: { id }, data: { publishingLockedAt: null } })
      .catch(() => {});
    return NextResponse.json({ error: "Erro ao publicar direto" }, { status: 500 });
  }
}
