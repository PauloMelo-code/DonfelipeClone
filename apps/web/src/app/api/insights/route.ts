import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

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
      prisma.whatsAppGroup.findMany({
        where: { role: "SOURCE" },
        select: { groupId: true, name: true },
      }),
      prisma.vehicle.groupBy({
        by: ["sourceGroupId"],
        where: { capturedAt: { gte: thirtyDaysAgo }, sourceGroupId: { not: null } },
        _count: { _all: true },
      }),
      prisma.vehicle.groupBy({
        by: ["sourceGroupId"],
        where: {
          status: { in: ["APPROVED", "PUBLISHED"] },
          capturedAt: { gte: thirtyDaysAgo },
          sourceGroupId: { not: null },
        },
        _count: { _all: true },
      }),
      prisma.vehicle.groupBy({
        by: ["sourceGroupId"],
        where: {
          soldAt: { not: null },
          capturedAt: { gte: thirtyDaysAgo },
          sourceGroupId: { not: null },
        },
        _count: { _all: true },
      }),
    ]);

    const captureMap = new Map(captureGroups.map((r) => [r.sourceGroupId!, r._count._all]));
    const approvedMap = new Map(approvedGroups.map((r) => [r.sourceGroupId!, r._count._all]));
    const soldMap = new Map(soldGroups.map((r) => [r.sourceGroupId!, r._count._all]));

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
    const rejected = await prisma.vehicle.findMany({
      where: { status: "REJECTED", rejectedAt: { gte: thirtyDaysAgo } },
      select: { rejectionTags: true },
      take: 1000,
    });

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
    const totalCaptured = await prisma.vehicle.count({
      where: { capturedAt: { gte: thirtyDaysAgo } },
    });
    const totalApproved = await prisma.vehicle.count({
      where: { status: { in: ["APPROVED", "PUBLISHED"] }, capturedAt: { gte: thirtyDaysAgo } },
    });
    const totalPublished = await prisma.vehicle.count({
      where: { status: "PUBLISHED", capturedAt: { gte: thirtyDaysAgo } },
    });
    const totalSold = await prisma.vehicle.count({
      where: { soldAt: { not: null }, capturedAt: { gte: thirtyDaysAgo } },
    });

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
