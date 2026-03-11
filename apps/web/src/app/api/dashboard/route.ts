import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

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
    ]);

    const total = approvedVehicles + publishedVehicles + rejectedVehicles;
    const approvalRate =
      total > 0
        ? (((approvedVehicles + publishedVehicles) / total) * 100).toFixed(1)
        : "0";

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error("[Dashboard] Error fetching metrics:", error);
    return NextResponse.json(
      { error: "Erro ao carregar metricas do dashboard" },
      { status: 500 }
    );
  }
}
