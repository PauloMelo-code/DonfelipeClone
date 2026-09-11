import { NextResponse } from "next/server";
import { and, eq, gte, lt, isNotNull, inArray, count, avg, desc, type SQL } from "drizzle-orm";
import { db, veiculos, historicoPublicacao, gruposWhatsapp, vivos, vivosE } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// 20s cache for the heavy 17-query payload. Multiple tabs/users share one
// computation cycle; staleness <20s is fine for a dashboard.
let dashCache: { data: unknown; expiresAt: number } | null = null;
const DASH_TTL_MS = 20_000;

/** Conta linhas VIVAS de uma tabela com as condicoes dadas. */
async function contar(
  tabela: typeof veiculos | typeof historicoPublicacao | typeof gruposWhatsapp,
  ...condicoes: (SQL | undefined)[]
): Promise<number> {
  const [linha] = await db
    .select({ n: count() })
    .from(tabela)
    .where(and(vivos(tabela), ...condicoes));
  return linha?.n ?? 0;
}

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  if (dashCache && dashCache.expiresAt > Date.now()) {
    return NextResponse.json(dashCache.data, { headers: { "X-Cache": "HIT" } });
  }

  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const sevenDaysAgo = new Date(startOfDay);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [
      totalVehicles,
      pendingVehicles,
      approvedVehicles,
      rejectedVehicles,
      publishedVehicles,
      todayCaptures,
      weekCaptures,
      monthCaptures,
      totalPosts,
      todayPosts,
      sourceGroups,
      targetGroups,
      vipPending,
      topGroupsRaw,
      [qualityAgg],
      highScorePending,
      staleApprovedCount,
    ] = await Promise.all([
      contar(veiculos),
      contar(veiculos, eq(veiculos.status, "PENDING")),
      contar(veiculos, eq(veiculos.status, "APPROVED")),
      contar(veiculos, eq(veiculos.status, "REJECTED")),
      contar(veiculos, eq(veiculos.status, "PUBLISHED")),
      contar(veiculos, gte(veiculos.capturedAt, startOfDay)),
      contar(veiculos, gte(veiculos.capturedAt, startOfWeek)),
      contar(veiculos, gte(veiculos.capturedAt, startOfMonth)),
      contar(historicoPublicacao, eq(historicoPublicacao.success, true)),
      contar(
        historicoPublicacao,
        eq(historicoPublicacao.success, true),
        gte(historicoPublicacao.postedAt, startOfDay)
      ),
      contar(gruposWhatsapp, eq(gruposWhatsapp.role, "SOURCE"), eq(gruposWhatsapp.active, true)),
      contar(gruposWhatsapp, eq(gruposWhatsapp.role, "TARGET"), eq(gruposWhatsapp.active, true)),
      contar(veiculos, eq(veiculos.status, "PENDING"), eq(veiculos.isVip, true)),
      // Sem limite pequeno: cliente quer ver TODOS os fornecedores ativos no
      // periodo (7 dias). O card no front tem scroll interno.
      db
        .select({ sourceGroupId: veiculos.sourceGroupId, total: count() })
        .from(veiculos)
        .where(
          vivosE(
            veiculos,
            gte(veiculos.capturedAt, sevenDaysAgo),
            isNotNull(veiculos.sourceGroupId)
          )
        )
        .groupBy(veiculos.sourceGroupId)
        .orderBy(desc(count()))
        .limit(100),
      db
        .select({ media: avg(veiculos.qualityScore) })
        .from(veiculos)
        .where(
          vivosE(veiculos, eq(veiculos.status, "PENDING"), isNotNull(veiculos.qualityScore))
        ),
      contar(veiculos, eq(veiculos.status, "PENDING"), gte(veiculos.qualityScore, 8)),
      contar(
        veiculos,
        eq(veiculos.status, "APPROVED"),
        lt(veiculos.approvedAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
      ),
    ]);

    const topGroupIds = topGroupsRaw
      .map((g) => g.sourceGroupId)
      .filter((id): id is string => !!id);
    const groupNames = topGroupIds.length
      ? await db
          .select({ groupId: gruposWhatsapp.groupId, name: gruposWhatsapp.name })
          .from(gruposWhatsapp)
          .where(inArray(gruposWhatsapp.groupId, topGroupIds))
      : [];
    const nameMap = new Map(groupNames.map((g) => [g.groupId, g.name]));
    const topGroupsWeek = topGroupsRaw.map((g) => ({
      groupId: g.sourceGroupId as string,
      name: nameMap.get(g.sourceGroupId as string) || "Grupo desconhecido",
      count: g.total,
    }));

    const total = approvedVehicles + publishedVehicles + rejectedVehicles;
    const approvalRate =
      total > 0
        ? (((approvedVehicles + publishedVehicles) / total) * 100).toFixed(1)
        : "0";

    // avg() do Postgres volta como string (numeric); o front espera numero.
    const avgQualityScore = qualityAgg?.media ? Number(qualityAgg.media) : 0;

    const payload = {
      vehicles: {
        total: totalVehicles,
        pending: pendingVehicles,
        approved: approvedVehicles,
        rejected: rejectedVehicles,
        published: publishedVehicles,
      },
      captures: {
        today: todayCaptures,
        week: weekCaptures,
        month: monthCaptures,
      },
      publications: {
        total: totalPosts,
        today: todayPosts,
      },
      groups: {
        source: sourceGroups,
        target: targetGroups,
      },
      rates: {
        approval: approvalRate,
      },
      vipPending,
      topGroupsWeek,
      avgQualityScore,
      highScorePending,
      staleApproved: staleApprovedCount,
    };

    dashCache = { data: payload, expiresAt: Date.now() + DASH_TTL_MS };
    return NextResponse.json(payload, { headers: { "X-Cache": "MISS" } });
  } catch (error) {
    console.error("[Dashboard] Error fetching metrics:", error);
    return NextResponse.json(
      { error: "Erro ao carregar metricas do dashboard" },
      { status: 500 }
    );
  }
}
