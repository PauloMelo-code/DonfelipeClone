import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

// 20s cache for the heavy 17-query payload. Multiple tabs/users share one
// computation cycle; staleness <20s is fine for a dashboard.
let dashCache: { data: unknown; expiresAt: number } | null = null;
const DASH_TTL_MS = 20_000;

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  if (dashCache && dashCache.expiresAt > Date.now()) {
    return NextResponse.json(dashCache.data, { headers: { "X-Cache": "HIT" } });
  }

  try {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
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
      qualityAgg,
      highScorePending,
      staleApprovedCount,
    ] = await Promise.all([
      prisma.vehicle.count(),
      prisma.vehicle.count({ where: { status: "PENDING" } }),
      prisma.vehicle.count({ where: { status: "APPROVED" } }),
      prisma.vehicle.count({ where: { status: "REJECTED" } }),
      prisma.vehicle.count({ where: { status: "PUBLISHED" } }),
      prisma.vehicle.count({ where: { capturedAt: { gte: startOfDay } } }),
      prisma.vehicle.count({ where: { capturedAt: { gte: startOfWeek } } }),
      prisma.vehicle.count({ where: { capturedAt: { gte: startOfMonth } } }),
      prisma.postHistory.count({ where: { success: true } }),
      prisma.postHistory.count({
        where: { success: true, postedAt: { gte: startOfDay } },
      }),
      prisma.whatsAppGroup.count({ where: { role: "SOURCE", active: true } }),
      prisma.whatsAppGroup.count({ where: { role: "TARGET", active: true } }),
      prisma.vehicle.count({ where: { status: "PENDING", isVip: true } }),
      prisma.vehicle.groupBy({
        by: ["sourceGroupId"],
        where: {
          capturedAt: { gte: sevenDaysAgo },
          sourceGroupId: { not: null },
        },
        _count: { _all: true },
        orderBy: { _count: { sourceGroupId: "desc" } },
        take: 5,
      }),
      prisma.vehicle.aggregate({
        where: { status: "PENDING", qualityScore: { not: null } },
        _avg: { qualityScore: true },
      }),
      prisma.vehicle.count({
        where: { status: "PENDING", qualityScore: { gte: 8 } },
      }),
      prisma.vehicle.count({
        where: {
          status: "APPROVED",
          approvedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const topGroupIds = topGroupsRaw
      .map((g) => g.sourceGroupId)
      .filter((id): id is string => !!id);
    const groupNames = topGroupIds.length
      ? await prisma.whatsAppGroup.findMany({
          where: { groupId: { in: topGroupIds } },
          select: { groupId: true, name: true },
        })
      : [];
    const nameMap = new Map(groupNames.map((g) => [g.groupId, g.name]));
    const topGroupsWeek = topGroupsRaw.map((g) => ({
      groupId: g.sourceGroupId as string,
      name: nameMap.get(g.sourceGroupId as string) || "Grupo desconhecido",
      count: g._count._all,
    }));

    const total = approvedVehicles + publishedVehicles + rejectedVehicles;
    const approvalRate =
      total > 0
        ? (((approvedVehicles + publishedVehicles) / total) * 100).toFixed(1)
        : "0";

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
      avgQualityScore: qualityAgg._avg.qualityScore ?? 0,
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
