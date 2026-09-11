import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import {
  db,
  gruposWhatsapp,
  historicoPublicacao,
  carimboDeEdicao,
  marcaDeExclusao,
  vivos,
  vivosE,
} from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { uazapi, uazapiSend } from "@/lib/uazapi";
import { invalidateGroupsCache } from "../route";
import axios from "axios";

/**
 * POST /api/groups/cleanup-orphans
 *
 * Identifica grupos no DB onde NENHUMA das instancias UAZAPI ainda participa
 * (a conta foi removida ou o grupo foi deletado). Marca esses como inativos
 * por padrao; com ?delete=true faz o delete LOGICO.
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

    const dbGroups = await db
      .select({
        id: gruposWhatsapp.id,
        groupId: gruposWhatsapp.groupId,
        name: gruposWhatsapp.name,
        active: gruposWhatsapp.active,
      })
      .from(gruposWhatsapp)
      .where(vivos(gruposWhatsapp));

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
    const ids = orphans.map((o) => o.id);

    if (shouldDelete) {
      // Delete LOGICO, aqui tambem. O historico de publicacao acompanha, mas
      // as linhas continuam no banco para consulta e auditoria.
      const orphanJids = orphans.map((o) => o.groupId);
      await db
        .update(historicoPublicacao)
        .set(marcaDeExclusao(auth.user.id))
        .where(
          vivosE(historicoPublicacao, inArray(historicoPublicacao.targetGroupId, orphanJids))
        );
      const removidos = await db
        .update(gruposWhatsapp)
        .set(marcaDeExclusao(auth.user.id))
        .where(vivosE(gruposWhatsapp, inArray(gruposWhatsapp.id, ids)))
        .returning({ id: gruposWhatsapp.id });
      affected = removidos.length;
    } else {
      const desativados = await db
        .update(gruposWhatsapp)
        .set({ active: false, ...carimboDeEdicao(auth.user.id) })
        .where(vivosE(gruposWhatsapp, inArray(gruposWhatsapp.id, ids)))
        .returning({ id: gruposWhatsapp.id });
      affected = desativados.length;
    }

    invalidateGroupsCache();

    return NextResponse.json({
      message: shouldDelete
        ? `${affected} grupos orfaos marcados como excluidos`
        : `${affected} grupos orfaos desativados (use ?delete=true pra excluir)`,
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
