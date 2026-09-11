import { NextResponse } from "next/server";
import { eq, or, isNull, sql } from "drizzle-orm";
import { db, gruposWhatsapp, carimboDeEdicao, vivosE } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { uazapi, uazapiSend } from "@/lib/uazapi";
import { invalidateGroupsCache } from "../route";

/**
 * POST /api/groups/repair-names
 *
 * Para cada grupo onde o nome eh igual ao groupId (sinal de que o sync nao
 * conseguiu resolver), tenta de novo usando TODAS as estrategias:
 *   1. listGroups(force=true) de ambas as instancias
 *   2. getGroupInfo() com varios endpoint shapes
 */
export async function POST() {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    // O Prisma nao comparava duas colunas no where e a rota trazia a tabela
    // inteira para filtrar em JS. O Drizzle compara no banco.
    const broken = await db
      .select({
        id: gruposWhatsapp.id,
        groupId: gruposWhatsapp.groupId,
        name: gruposWhatsapp.name,
      })
      .from(gruposWhatsapp)
      .where(
        vivosE(
          gruposWhatsapp,
          or(
            isNull(gruposWhatsapp.name),
            eq(sql`btrim(${gruposWhatsapp.name})`, sql`''`),
            eq(gruposWhatsapp.name, gruposWhatsapp.groupId)
          )
        )
      );

    if (broken.length === 0) {
      return NextResponse.json({
        message: "Nenhum grupo com nome quebrado",
        repaired: 0,
        stillBroken: 0,
      });
    }

    // Pre-carrega listGroups das duas instancias UAZAPI (uma vez so, force=true)
    // pra ter um dicionario rapido de JID -> subject
    const subjectByJid = new Map<string, string>();
    const [captureGroups, sendGroups] = await Promise.all([
      uazapi.listGroups(true).catch(() => []),
      uazapiSend.isConfigured ? uazapiSend.listGroups(true).catch(() => []) : Promise.resolve([]),
    ]);
    for (const g of captureGroups) {
      if (g.id && g.subject) subjectByJid.set(g.id, g.subject);
    }
    for (const g of sendGroups) {
      if (g.id && g.subject && !subjectByJid.has(g.id)) {
        subjectByJid.set(g.id, g.subject);
      }
    }

    let repaired = 0;
    const stillBroken: string[] = [];

    for (const g of broken) {
      let newName = subjectByJid.get(g.groupId);

      if (!newName) {
        const info = await uazapi.getGroupInfo(g.groupId).catch(() => null);
        newName = info?.subject;
      }
      if (!newName && uazapiSend.isConfigured) {
        const info = await uazapiSend.getGroupInfo(g.groupId).catch(() => null);
        newName = info?.subject;
      }

      if (newName && newName !== g.groupId) {
        await db
          .update(gruposWhatsapp)
          .set({ name: newName, ...carimboDeEdicao(auth.user.id) })
          .where(vivosE(gruposWhatsapp, eq(gruposWhatsapp.id, g.id)));
        repaired++;
      } else {
        stillBroken.push(g.groupId);
      }
    }

    invalidateGroupsCache();

    return NextResponse.json({
      message: `${repaired} grupos reparados`,
      total: broken.length,
      repaired,
      stillBroken: stillBroken.length,
      stillBrokenIds: stillBroken.slice(0, 20), // amostra pra debug
    });
  } catch (error) {
    console.error("[RepairNames] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado" },
      { status: 500 }
    );
  }
}
