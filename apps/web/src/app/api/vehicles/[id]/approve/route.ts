import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, veiculos, carimboDeEdicao, travaDeColisao, vivosE } from "@/lib/db";
import { registrarAuditoria } from "@/lib/audit";
import { prepararAprovacao } from "@/lib/actions/veiculos";
import { requireAuth } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;

    const [vehicle] = await db
      .select()
      .from(veiculos)
      .where(vivosE(veiculos, eq(veiculos.id, id)))
      .limit(1);
    if (!vehicle) {
      return NextResponse.json(
        { error: "Veiculo nao encontrado" },
        { status: 404 }
      );
    }

    if (vehicle.status === "APPROVED") {
      // Idempotent: already approved, return success
      let f: unknown[] = [];
      let p: unknown[] = [];
      try { f = JSON.parse(vehicle.features || "[]"); } catch { /* */ }
      try { p = JSON.parse(vehicle.photos || "[]"); } catch { /* */ }
      return NextResponse.json({ ...vehicle, features: f, photos: p });
    }

    if (vehicle.status !== "PENDING") {
      return NextResponse.json(
        { error: `Veiculo nao pode ser aprovado no status ${vehicle.status}` },
        { status: 400 }
      );
    }

    // FIPE, precificacao e anuncio formatado vivem em lib/actions/veiculos:
    // esta logica era copiada tambem no publish-direct, e as copias ja tinham
    // divergido. A gravacao intermediaria de fipePrice saiu junto -- o UPDATE
    // logo abaixo ja grava o mesmo valor.
    const aprovacao = await prepararAprovacao(vehicle);
    const { fipePrice, sellingPrice, formattedAd } = aprovacao;
    const margin = aprovacao.margem;
    const effectiveMargin = aprovacao.margemEfetiva;

    // Sem carimbo de colisao: a aprovacao chama IA (cleanAdDescription) e
    // esta mesma funcao pode ter gravado fipePrice antes. O updatedAt lido no
    // inicio ja estaria vencido. A trava mantem id + vivo.
    const [updated] = await db
      .update(veiculos)
      .set({
        status: "APPROVED",
        sellingPrice,
        formattedAd,
        fipePrice,
        approvedAt: new Date(),
        ...carimboDeEdicao(auth.user.id),
      })
      .where(travaDeColisao(veiculos, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Veiculo alterado por outro usuario. Recarregue a tela." },
        { status: 409 }
      );
    }

    await registrarAuditoria({
      action: "VEHICLE_APPROVED",
      entityType: "Vehicle",
      entityId: id,
      vehicleId: id,
      userId: auth.user.id,
      details: {
        margin,
        effectiveMargin,
        sellingPrice,
        originalPrice: vehicle.price,
      },
      request,
    });

    let parsedFeatures: string[] = [];
    let parsedPhotos: string[] = [];
    try { parsedFeatures = JSON.parse(updated.features || "[]"); } catch { /* */ }
    try { parsedPhotos = JSON.parse(updated.photos || "[]"); } catch { /* */ }

    return NextResponse.json({
      ...updated,
      features: parsedFeatures,
      photos: parsedPhotos,
    });
  } catch (error) {
    console.error("[Vehicles] Error approving vehicle:", error);
    return NextResponse.json(
      { error: "Erro ao aprovar veiculo" },
      { status: 500 }
    );
  }
}
