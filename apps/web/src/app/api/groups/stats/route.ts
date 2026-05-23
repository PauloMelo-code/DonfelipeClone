import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/groups/stats?role=SOURCE|TARGET
 *
 * Retorna contagem por tipo de chat (grupo, canal, comunidade, lista, contato)
 * pra mostrar nas pills de filtro da tela /grupos.
 *
 * Cache em-memoria (15s) -- contadores nao precisam ser ao vivo.
 */
type StatsByType = {
  todos: number;
  grupo: number;
  canal: number;
  comunidade: number;
  lista: number;
  contato: number;
};

const statsCache = new Map<string, { data: StatsByType; expiresAt: number }>();
const TTL_MS = 15_000;

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role");

  const cacheKey = role ?? "ALL";
  const cached = statsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data, { headers: { "X-Cache": "HIT" } });
  }

  const baseWhere: Record<string, unknown> = {};
  if (role && role !== "ALL") baseWhere.role = role;

  try {
    // 5 counts em paralelo (canais/comunidades/listas/contatos + total).
    // "Grupo comum" e calculado como total - outros pra evitar 6a query.
    const [todos, canal, comunidade, lista, contato] = await Promise.all([
      prisma.whatsAppGroup.count({ where: baseWhere }),
      prisma.whatsAppGroup.count({
        where: {
          ...baseWhere,
          OR: [
            { isAnnounce: true },
            { groupId: { endsWith: "@newsletter" } },
          ],
        },
      }),
      prisma.whatsAppGroup.count({
        where: { ...baseWhere, isCommunity: true },
      }),
      prisma.whatsAppGroup.count({
        where: { ...baseWhere, groupId: { endsWith: "@broadcast" } },
      }),
      prisma.whatsAppGroup.count({
        where: {
          ...baseWhere,
          OR: [
            { isContact: true },
            { groupId: { endsWith: "@s.whatsapp.net" } },
          ],
        },
      }),
    ]);

    // Aproximado: grupo comum = total - outros (pode duplicar se grupo for
    // canal+comunidade ao mesmo tempo, mas isso e raro)
    const grupo = Math.max(0, todos - canal - comunidade - lista - contato);

    const stats: StatsByType = { todos, grupo, canal, comunidade, lista, contato };
    statsCache.set(cacheKey, { data: stats, expiresAt: Date.now() + TTL_MS });

    return NextResponse.json(stats, { headers: { "X-Cache": "MISS" } });
  } catch (error) {
    console.error("[GroupsStats] Error:", error);
    return NextResponse.json(
      { error: "Erro ao calcular estatisticas" },
      { status: 500 }
    );
  }
}

export function invalidateStatsCache() {
  statsCache.clear();
}
