import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
 *
 * Retorna quantos foram reparados e quantos seguem sem nome.
 */
export async function POST() {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    // Prisma nao tem comparacao entre campos no where direto, entao buscamos
    // tudo e filtramos em JS. Volume tipico (<300 grupos) torna isso barato.
    const all = await prisma.whatsAppGroup.findMany({
      select: { id: true, groupId: true, name: true },
    });
    const broken = all.filter((g) => !g.name || g.name === g.groupId || g.name.trim() === "");

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
      // Primeira tentativa: dicionario do list
      let newName = subjectByJid.get(g.groupId);

      // Segunda tentativa: getGroupInfo
      if (!newName) {
        // Tenta na instancia de captura primeiro
        const info = await uazapi.getGroupInfo(g.groupId).catch(() => null);
        newName = info?.subject;
      }
      if (!newName && uazapiSend.isConfigured) {
        const info = await uazapiSend.getGroupInfo(g.groupId).catch(() => null);
        newName = info?.subject;
      }

      if (newName && newName !== g.groupId) {
        await prisma.whatsAppGroup.update({
          where: { id: g.id },
          data: { name: newName },
        });
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
