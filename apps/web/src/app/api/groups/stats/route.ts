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
    // kindOverride tem prioridade -- conta primeiro por override.
    // Pro resto (kindOverride null), aplica regra natural por sufixo JID.
    const buildWhere = (auto: Record<string, unknown>, kindKey: string) => ({
      ...baseWhere,
      OR: [
        { kindOverride: kindKey },
        { AND: [{ kindOverride: null }, auto] },
      ],
    });

    const [todos, canal, comunidade, lista, contato, grupo] = await Promise.all([
      prisma.whatsAppGroup.count({ where: baseWhere }),
      prisma.whatsAppGroup.count({
        where: buildWhere({ groupId: { endsWith: "@newsletter" } }, "canal"),
      }),
      prisma.whatsAppGroup.count({
        where: buildWhere(
          { AND: [{ groupId: { endsWith: "@g.us" } }, { isCommunity: true }] },
          "comunidade"
        ),
      }),
      prisma.whatsAppGroup.count({
        where: buildWhere({ groupId: { endsWith: "@broadcast" } }, "lista"),
      }),
      prisma.whatsAppGroup.count({
        where: buildWhere(
          {
            OR: [
              { isContact: true },
              { groupId: { endsWith: "@s.whatsapp.net" } },
            ],
          },
          "contato"
        ),
      }),
      prisma.whatsAppGroup.count({
        where: buildWhere(
          {
            AND: [
              { groupId: { endsWith: "@g.us" } },
              { isCommunity: false },
              { isContact: false },
            ],
          },
          "grupo"
        ),
      }),
    ]);

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
