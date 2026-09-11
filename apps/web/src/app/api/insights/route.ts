import { NextResponse } from "next/server";
import { and, eq, gte, inArray, isNotNull, count, type SQL } from "drizzle-orm";
import { db, veiculos, gruposWhatsapp, vivos, vivosE } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/** Captura por grupo de origem nos ultimos 30 dias, com filtro extra opcional. */
async function porGrupo(extra?: SQL) {
  const trintaDias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return db
    .select({ sourceGroupId: veiculos.sourceGroupId, total: count() })
    .from(veiculos)
    .where(
      vivosE(
        veiculos,
        gte(veiculos.capturedAt, trintaDias),
        isNotNull(veiculos.sourceGroupId),
        extra
      )
    )
    .groupBy(veiculos.sourceGroupId);
}

/** Conta veiculos VIVOS com as condicoes dadas. */
async function contarVeiculos(...condicoes: (SQL | undefined)[]): Promise<number> {
  const [linha] = await db
    .select({ n: count() })
    .from(veiculos)
    .where(and(vivos(veiculos), ...condicoes));
  return linha?.n ?? 0;
}

// Cache insights for 5min — heavy aggregation, not real-time critical
let insightsCache: { data: unknown; expiresAt: number } | null = null;
const INSIGHTS_TTL_MS = 5 * 60_000;

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  if (insightsCache && insightsCache.expiresAt > Date.now()) {
    return NextResponse.json(insightsCache.data, {
      headers: { "X-Cache": "HIT" },
    });
  }

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Single batched query: groupBy for captures/approvals/sold per source group.
    // Replaces N×3 individual count() calls (was up to 300 queries with 100+ groups).
    const [allGroups, captureGroups, approvedGroups, soldGroups] = await Promise.all([
      db
        .select({ groupId: gruposWhatsapp.groupId, name: gruposWhatsapp.name })
        .from(gruposWhatsapp)
        .where(vivosE(gruposWhatsapp, eq(gruposWhatsapp.role, "SOURCE"))),
      porGrupo(),
      porGrupo(inArray(veiculos.status, ["APPROVED", "PUBLISHED"])),
      porGrupo(isNotNull(veiculos.soldAt)),
    ]);

    const captureMap = new Map(captureGroups.map((r) => [r.sourceGroupId!, r.total]));
    const approvedMap = new Map(approvedGroups.map((r) => [r.sourceGroupId!, r.total]));
    const soldMap = new Map(soldGroups.map((r) => [r.sourceGroupId!, r.total]));

    const groupStats = allGroups.map((g) => {
      const captured = captureMap.get(g.groupId) ?? 0;
      const approved = approvedMap.get(g.groupId) ?? 0;
      const sold = soldMap.get(g.groupId) ?? 0;
      return {
        name: g.name,
        groupId: g.groupId,
        captured,
        approved,
        sold,
        approvalRate: captured > 0 ? Math.round((approved / captured) * 100) : 0,
        conversionRate: captured > 0 ? Math.round((sold / captured) * 100) : 0,
      };
    });

    const topGroups = groupStats
      .filter((g) => g.captured > 0)
      .sort((a, b) => b.approvalRate - a.approvalRate)
      .slice(0, 20);

    // 2. Motivos de rejeicao (rejection_tags)
    const rejected = await db
      .select({ rejectionTags: veiculos.rejectionTags })
      .from(veiculos)
      .where(
        vivosE(veiculos, eq(veiculos.status, "REJECTED"), gte(veiculos.rejectedAt, thirtyDaysAgo))
      )
      .limit(1000);

    const tagCount = new Map<string, number>();
    for (const v of rejected) {
      if (!v.rejectionTags) continue;
      try {
        const tags: string[] = JSON.parse(v.rejectionTags);
        for (const t of tags) tagCount.set(t, (tagCount.get(t) || 0) + 1);
      } catch { /* ignore */ }
    }

    const topRejectionTags = Array.from(tagCount.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 3. Funil de conversao (30 dias)
    const noPeriodo = (extra?: SQL) =>
      contarVeiculos(gte(veiculos.capturedAt, thirtyDaysAgo), extra);

    const totalCaptured = await noPeriodo();
    const totalApproved = await noPeriodo(inArray(veiculos.status, ["APPROVED", "PUBLISHED"]));
    const totalPublished = await noPeriodo(eq(veiculos.status, "PUBLISHED"));
    const totalSold = await noPeriodo(isNotNull(veiculos.soldAt));

    const payload = {
      period: "30_days",
      funnel: {
        captured: totalCaptured,
        approved: totalApproved,
        published: totalPublished,
        sold: totalSold,
      },
      topGroups,
      topRejectionTags,
    };

    insightsCache = { data: payload, expiresAt: Date.now() + INSIGHTS_TTL_MS };
    return NextResponse.json(payload, { headers: { "X-Cache": "MISS" } });
  } catch (error) {
    console.error("[Insights] Error:", error);
    return NextResponse.json({ error: "Erro ao buscar insights" }, { status: 500 });
  }
}
