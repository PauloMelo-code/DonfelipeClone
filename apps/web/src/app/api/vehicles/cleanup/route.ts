import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/vehicles/cleanup?mode=no_photo|bad_margin|all
 * Remove vehicles based on cleanup mode.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  const mode = request.nextUrl.searchParams.get("mode") || "no_photo";

  try {
    const vehicles = await prisma.vehicle.findMany({
      select: { id: true, model: true, photos: true, status: true, price: true, fipePrice: true },
    });

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
          await prisma.auditLog.updateMany({ where: { vehicleId: v.id }, data: { vehicleId: null } });
          await prisma.postHistory.deleteMany({ where: { vehicleId: v.id } });
          await prisma.vehicle.delete({ where: { id: v.id } });
          removed++;
          removedList.push({ model: v.model, status: v.status, reason });
        } catch (err) {
          console.warn(`[cleanup] Failed to delete ${v.id} (${v.model}):`, err);
        }
      }
    }

    const modeLabel = mode === "no_photo" ? "sem foto" : mode === "bad_margin" ? "sem margem" : "sem foto + sem margem";

    return NextResponse.json({
      total: vehicles.length,
      removed,
      remaining: vehicles.length - removed,
      removedList,
      message: `${removed} veiculos (${modeLabel}) removidos`,
    });
  } catch (error) {
    console.error("[cleanup] Error:", error);
    return NextResponse.json({ error: "Erro ao limpar" }, { status: 500 });
  }
}
