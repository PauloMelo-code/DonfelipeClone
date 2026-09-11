import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, veiculos, historicoPublicacao, marcaDeExclusao, vivos, vivosE } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/vehicles/cleanup?mode=no_photo|bad_margin|all
 * Marca veiculos como EXCLUIDOS (delete logico) conforme o modo.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  const mode = request.nextUrl.searchParams.get("mode") || "no_photo";

  try {
    const vehicles = await db
      .select({
        id: veiculos.id,
        model: veiculos.model,
        photos: veiculos.photos,
        status: veiculos.status,
        price: veiculos.price,
        fipePrice: veiculos.fipePrice,
      })
      .from(veiculos)
      .where(vivos(veiculos));

    let removed = 0;
    const removedList: { model: string; status: string; reason: string }[] = [];

    for (const v of vehicles) {
      let shouldRemove = false;
      let reason = "";

      if (mode === "no_photo" || mode === "all") {
        let photos: string[] = [];
        try { photos = JSON.parse(v.photos || "[]"); } catch { photos = []; }

        if (photos.length === 0) {
          shouldRemove = true;
          reason = "sem foto";
        } else if (photos[0].startsWith("http") && !photos[0].includes("/api/media/")) {
          shouldRemove = true;
          reason = "foto CDN expirada";
        } else if (!photos[0] || photos[0].trim() === "") {
          shouldRemove = true;
          reason = "foto vazia";
        }
      }

      if (!shouldRemove && (mode === "bad_margin" || mode === "all")) {
        // Remove PENDING vehicles where price >= fipePrice (no margin or negative margin)
        if (v.status === "PENDING" && v.fipePrice && v.price >= v.fipePrice) {
          shouldRemove = true;
          reason = "margem negativa (preco >= FIPE)";
        }
        // Remove PENDING vehicles without FIPE that are likely bad
        // (keep them if no FIPE — can't determine margin)
      }

      if (shouldRemove) {
        try {
          // Delete LOGICO. A trilha de auditoria continua apontando para o
          // veiculo: antes o codigo zerava audit_logs.vehicleId e apagava o
          // historico so para conseguir remover a linha.
          await db
            .update(historicoPublicacao)
            .set(marcaDeExclusao(auth.user.id))
            .where(vivosE(historicoPublicacao, eq(historicoPublicacao.vehicleId, v.id)));
          await db
            .update(veiculos)
            .set(marcaDeExclusao(auth.user.id))
            .where(vivosE(veiculos, eq(veiculos.id, v.id)));
          removed++;
          removedList.push({ model: v.model, status: v.status, reason });
        } catch (err) {
          console.warn(`[cleanup] Falha ao excluir ${v.id} (${v.model}):`, err);
        }
      }
    }

    const modeLabel = mode === "no_photo" ? "sem foto" : mode === "bad_margin" ? "sem margem" : "sem foto + sem margem";

    return NextResponse.json({
      total: vehicles.length,
      removed,
      remaining: vehicles.length - removed,
      removedList,
      message: `${removed} veiculos (${modeLabel}) marcados como excluidos`,
    });
  } catch (error) {
    console.error("[cleanup] Error:", error);
    return NextResponse.json({ error: "Erro ao limpar" }, { status: 500 });
  }
}
