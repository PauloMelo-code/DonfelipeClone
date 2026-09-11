import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, lt, inArray, count } from "drizzle-orm";
import {
  db,
  veiculos,
  historicoPublicacao,
  trilhaAuditoria,
  arquivosMidia,
  marcaDeExclusao,
  vivos,
  vivosE,
} from "@/lib/db";
import { registrarAuditoria } from "@/lib/audit";
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
    const targets = await db
      .select({ id: veiculos.id, photos: veiculos.photos })
      .from(veiculos)
      .where(vivosE(veiculos, lt(veiculos.capturedAt, keepFrom)));
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
    const contar = async (
      tabela: typeof historicoPublicacao | typeof trilhaAuditoria | typeof veiculos,
      condicao: ReturnType<typeof eq>
    ) => {
      const [linha] = await db
        .select({ n: count() })
        .from(tabela)
        .where(and(vivos(tabela), condicao));
      return linha?.n ?? 0;
    };

    const [postCount, auditCount, kept] = await Promise.all([
      targetIds.length
        ? contar(historicoPublicacao, inArray(historicoPublicacao.vehicleId, targetIds))
        : Promise.resolve(0),
      targetIds.length
        ? contar(trilhaAuditoria, inArray(trilhaAuditoria.vehicleId, targetIds))
        : Promise.resolve(0),
      contar(veiculos, gte(veiculos.capturedAt, keepFrom)),
    ]);

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        keepFrom: keepFrom.toISOString(),
        wouldDelete: {
          vehicles: targetIds.length,
          postHistory: postCount,
          // A trilha NAO e apagada: o numero fica so como referencia do
          // quanto de historico esses veiculos tem.
          auditLogs: 0,
          auditLogsPreservados: auditCount,
          mediaFiles: mediaIds.size,
        },
        kept: { vehicles: kept },
      });
    }

    // 4. Marcar como EXCLUIDO em batches. Nada e apagado de verdade, e a
    //    TRILHA DE AUDITORIA NAO E TOCADA -- o codigo antigo fazia
    //    auditLog.deleteMany aqui e destruia a prova junto com os veiculos.
    const BATCH = 500;
    let deletedPosts = 0;
    const deletedAudit = 0;
    let deletedVehicles = 0;
    let deletedMedia = 0;

    for (let i = 0; i < targetIds.length; i += BATCH) {
      const batch = targetIds.slice(i, i + BATCH);
      await db.transaction(async (tx) => {
        const posts = await tx
          .update(historicoPublicacao)
          .set(marcaDeExclusao(auth.user.id))
          .where(
            and(
              vivos(historicoPublicacao),
              inArray(historicoPublicacao.vehicleId, batch)
            )
          )
          .returning({ id: historicoPublicacao.id });
        const marcados = await tx
          .update(veiculos)
          .set(marcaDeExclusao(auth.user.id))
          .where(and(vivos(veiculos), inArray(veiculos.id, batch)))
          .returning({ id: veiculos.id });
        deletedPosts += posts.length;
        deletedVehicles += marcados.length;
      });
    }

    // 5. Apagar media files referenciados pelos veiculos deletados
    //    (so apaga se NENHUM outro veiculo ainda referencia — checagem por seguranca)
    if (mediaIds.size > 0) {
      const remainingMedia = await db
        .select({ photos: veiculos.photos })
        .from(veiculos)
        .where(vivos(veiculos));
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
        const removidas = await db
          .update(arquivosMidia)
          .set(marcaDeExclusao(auth.user.id))
          .where(vivosE(arquivosMidia, inArray(arquivosMidia.id, mediaToDelete)))
          .returning({ id: arquivosMidia.id });
        deletedMedia = removidas.length;
      }
    }

    // 6. Audit log do reset (em registro separado, vinculado ao usuario)
    await registrarAuditoria({
      action: "VEHICLES_RESET",
      userId: auth.user.id,
      details: {
        keepFrom: keepFrom.toISOString(),
        deletedVehicles,
        deletedPosts,
        auditLogsPreservados: auditCount,
        deletedMedia,
      },
      request,
    });

    return NextResponse.json({
      dryRun: false,
      keepFrom: keepFrom.toISOString(),
      deleted: {
        vehicles: deletedVehicles,
        postHistory: deletedPosts,
        auditLogs: deletedAudit, // sempre 0: a trilha e append-only
        mediaFiles: deletedMedia,
      },
      auditLogsPreservados: auditCount,
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
