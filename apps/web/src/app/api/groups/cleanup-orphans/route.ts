import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { uazapi, uazapiSend } from "@/lib/uazapi";
import { invalidateGroupsCache } from "../route";
import axios from "axios";

/**
 * POST /api/groups/cleanup-orphans
 *
 * Identifica grupos no DB onde NENHUMA das instancias UAZAPI ainda participa
 * (a conta foi removida ou o grupo foi deletado). Marca esses como inativos
 * por padrao; com ?delete=true remove do DB.
 *
 * Detecta via:
 *  - listGroups() de ambas as instancias -> JIDs visiveis
 *  - listChats() de ambas as instancias -> conjunto amplo
 *  - Se nao aparece em NENHUM dos dois, eh orfao.
 */
export async function POST(request: Request) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  const url = new URL(request.url);
  const shouldDelete = url.searchParams.get("delete") === "true";

  try {
    // Pega todos os grupos vistos pelas instancias
    const seenJids = new Set<string>();
    const collect = async (list: () => Promise<Array<{ id: string }>>) => {
      try {
        const items = await list();
        for (const it of items) if (it.id) seenJids.add(it.id);
      } catch (e) {
        if (!axios.isAxiosError(e)) console.error(e);
      }
    };
    await collect(() => uazapi.listGroups(true));
    await collect(async () => (await uazapi.listChats()).map((c) => ({ id: c.id })));
    if (uazapiSend.isConfigured) {
      await collect(() => uazapiSend.listGroups(true));
      await collect(async () => (await uazapiSend.listChats()).map((c) => ({ id: c.id })));
    }

    // Pega grupos do DB
    const dbGroups = await prisma.whatsAppGroup.findMany({
      select: { id: true, groupId: true, name: true, active: true },
    });

    const orphans = dbGroups.filter((g) => !seenJids.has(g.groupId));

    if (orphans.length === 0) {
      return NextResponse.json({
        message: "Nenhum grupo orfao encontrado",
        seenInUazapi: seenJids.size,
        totalDb: dbGroups.length,
        orphans: 0,
      });
    }

    let affected = 0;
    if (shouldDelete) {
      const ids = orphans.map((o) => o.id);
      // Limpa referencias antes do delete
      const orphanJids = orphans.map((o) => o.groupId);
      await prisma.vehicle.updateMany({
        where: { sourceGroupId: { in: orphanJids } },
        data: { sourceGroupId: null },
      });
      await prisma.postHistory.deleteMany({
        where: { targetGroupId: { in: orphanJids } },
      });
      const result = await prisma.whatsAppGroup.deleteMany({ where: { id: { in: ids } } });
      affected = result.count;
    } else {
      // So desativa
      const ids = orphans.map((o) => o.id);
      const result = await prisma.whatsAppGroup.updateMany({
        where: { id: { in: ids } },
        data: { active: false },
      });
      affected = result.count;
    }

    invalidateGroupsCache();

    return NextResponse.json({
      message: shouldDelete
        ? `${affected} grupos orfaos REMOVIDOS do DB`
        : `${affected} grupos orfaos desativados (use ?delete=true pra remover)`,
      seenInUazapi: seenJids.size,
      totalDb: dbGroups.length,
      orphans: orphans.length,
      affected,
      sample: orphans.slice(0, 10).map((o) => ({ groupId: o.groupId, name: o.name })),
    });
  } catch (error) {
    console.error("[CleanupOrphans] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado" },
      { status: 500 }
    );
  }
}
