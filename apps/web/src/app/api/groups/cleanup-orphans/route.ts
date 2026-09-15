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
    const falhas: string[] = [];
    const collect = async (rotulo: string, list: () => Promise<Array<{ id: string }>>) => {
      try {
        const items = await list();
        for (const it of items) if (it.id) seenJids.add(it.id);
      } catch (e) {
        falhas.push(rotulo);
        console.error(`[CleanupOrphans] ${rotulo} falhou:`, axios.isAxiosError(e) ? e.message : e);
      }
    };
    await collect("grupos da captura", () => uazapi.listGroups(true));
    await collect("conversas da captura", async () => (await uazapi.listChats()).map((c) => ({ id: c.id })));
    if (uazapiSend.isConfigured) {
      await collect("grupos do envio", () => uazapiSend.listGroups(true));
      await collect("conversas do envio", async () => (await uazapiSend.listChats()).map((c) => ({ id: c.id })));
    }

    // FAIL-CLOSED. Orfao e "nenhuma instancia viu", entao uma listagem que
    // falhou faria TODO grupo dela parecer orfao -- e o modo apagar levaria a
    // base inteira. Com a visao incompleta, nada e marcado.
    if (falhas.length > 0 || seenJids.size === 0) {
      return NextResponse.json(
        {
          error:
            falhas.length > 0
              ? `A UAZAPI não respondeu (${falhas.join(", ")}). Nada foi alterado.`
              : "Nenhuma instância devolveu grupos. Nada foi alterado.",
        },
        { status: 502 }
      );
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
