import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/admin/reset-vehicles
 *
 * Deleta veiculos capturados antes de uma data (default: comeco de hoje no
 * fuso horario do servidor). Mantem so os "novos".
 *
 * Body:
 *   - keepFrom?: string (ISO datetime)  -- veiculos com capturedAt >= isso ficam
 *   - dryRun?: boolean (default false)  -- se true, so conta sem apagar
 *
 * Cascade manual (pra evitar queries enormes):
 *   1. PostHistory dos veiculos alvo
 *   2. AuditLog vinculado aos veiculos alvo
 *   3. Vehicle
 *   4. MediaFile orfas (nenhum Vehicle.photos referencia mais)
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  let body: { keepFrom?: string; dryRun?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // body opcional
  }

  // Default: keepFrom = comeco de hoje (00:00:00 local server time)
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const keepFrom = body.keepFrom ? new Date(body.keepFrom) : startOfToday;
  if (isNaN(keepFrom.getTime())) {
    return NextResponse.json({ error: "keepFrom invalido" }, { status: 400 });
  }
  const dryRun = body.dryRun ?? false;

  try {
    // 1. Levantar IDs dos veiculos a apagar
    const targets = await prisma.vehicle.findMany({
      where: { capturedAt: { lt: keepFrom } },
      select: { id: true, photos: true },
    });
    const targetIds = targets.map((v) => v.id);

    // 2. Coletar IDs de media referenciados (pra limpeza opcional)
    const mediaIds = new Set<string>();
    for (const v of targets) {
      try {
        const photos: string[] = JSON.parse(v.photos);
        for (const p of photos) {
          if (typeof p === "string" && p.startsWith("/api/media/")) {
            mediaIds.add(p.replace("/api/media/", ""));
          }
        }
      } catch { /* ignore */ }
    }

    // 3. Contar registros vinculados
    const [postCount, auditCount, kept] = await Promise.all([
      prisma.postHistory.count({ where: { vehicleId: { in: targetIds } } }),
      prisma.auditLog.count({ where: { vehicleId: { in: targetIds } } }),
      prisma.vehicle.count({ where: { capturedAt: { gte: keepFrom } } }),
    ]);

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        keepFrom: keepFrom.toISOString(),
        wouldDelete: {
          vehicles: targetIds.length,
          postHistory: postCount,
          auditLogs: auditCount,
          mediaFiles: mediaIds.size,
        },
        kept: { vehicles: kept },
      });
    }

    // 4. Apagar em batches (PostgreSQL ok com WHERE id IN (...) ate ~10k)
    const BATCH = 500;
    let deletedPosts = 0;
    let deletedAudit = 0;
    let deletedVehicles = 0;
    let deletedMedia = 0;

    for (let i = 0; i < targetIds.length; i += BATCH) {
      const batch = targetIds.slice(i, i + BATCH);
      const [posts, audit, vehicles] = await prisma.$transaction([
        prisma.postHistory.deleteMany({ where: { vehicleId: { in: batch } } }),
        prisma.auditLog.deleteMany({ where: { vehicleId: { in: batch } } }),
        prisma.vehicle.deleteMany({ where: { id: { in: batch } } }),
      ]);
      deletedPosts += posts.count;
      deletedAudit += audit.count;
      deletedVehicles += vehicles.count;
    }

    // 5. Apagar media files referenciados pelos veiculos deletados
    //    (so apaga se NENHUM outro veiculo ainda referencia — checagem por seguranca)
    if (mediaIds.size > 0) {
      const remainingMedia = await prisma.vehicle.findMany({
        select: { photos: true },
      });
      const stillReferenced = new Set<string>();
      for (const v of remainingMedia) {
        try {
          const photos: string[] = JSON.parse(v.photos);
          for (const p of photos) {
            if (typeof p === "string" && p.startsWith("/api/media/")) {
              stillReferenced.add(p.replace("/api/media/", ""));
            }
          }
        } catch { /* ignore */ }
      }
      const mediaToDelete = Array.from(mediaIds).filter((id) => !stillReferenced.has(id));
      if (mediaToDelete.length > 0) {
        const result = await prisma.mediaFile.deleteMany({
          where: { id: { in: mediaToDelete } },
        });
        deletedMedia = result.count;
      }
    }

    // 6. Audit log do reset (em registro separado, vinculado ao usuario)
    await prisma.auditLog.create({
      data: {
        action: "VEHICLES_RESET",
        userId: auth.user.id,
        details: JSON.stringify({
          keepFrom: keepFrom.toISOString(),
          deletedVehicles,
          deletedPosts,
          deletedAudit,
          deletedMedia,
        }),
      },
    });

    return NextResponse.json({
      dryRun: false,
      keepFrom: keepFrom.toISOString(),
      deleted: {
        vehicles: deletedVehicles,
        postHistory: deletedPosts,
        auditLogs: deletedAudit,
        mediaFiles: deletedMedia,
      },
      kept: { vehicles: kept },
    });
  } catch (error) {
    console.error("[ResetVehicles] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado" },
      { status: 500 }
    );
  }
}
