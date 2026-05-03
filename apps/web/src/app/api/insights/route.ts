import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // 1. Top fornecedores (grupos fonte) por taxa de aprovacao
    const allGroups = await prisma.whatsAppGroup.findMany({
      where: { role: "SOURCE" },
      include: {
        _count: { select: { sourceVehicles: true } },
      },
    });

    const groupStats = await Promise.all(
      allGroups.map(async (g) => {
        const captured = await prisma.vehicle.count({
          where: { sourceGroupId: g.groupId, capturedAt: { gte: thirtyDaysAgo } },
        });
        const approved = await prisma.vehicle.count({
          where: { sourceGroupId: g.groupId, status: { in: ["APPROVED", "PUBLISHED"] }, capturedAt: { gte: thirtyDaysAgo } },
        });
        const sold = await prisma.vehicle.count({
          where: { sourceGroupId: g.groupId, soldAt: { not: null }, capturedAt: { gte: thirtyDaysAgo } },
        });
        return {
          name: g.name,
          groupId: g.groupId,
          captured,
          approved,
          sold,
          approvalRate: captured > 0 ? Math.round((approved / captured) * 100) : 0,
          conversionRate: captured > 0 ? Math.round((sold / captured) * 100) : 0,
        };
      })
    );

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

    return NextResponse.json({
      period: "30_days",
      funnel: {
        captured: totalCaptured,
        approved: totalApproved,
        published: totalPublished,
        sold: totalSold,
      },
      topGroups,
      topRejectionTags,
    });
  } catch (error) {
    console.error("[Insights] Error:", error);
    return NextResponse.json({ error: "Erro ao buscar insights" }, { status: 500 });
  }
}
