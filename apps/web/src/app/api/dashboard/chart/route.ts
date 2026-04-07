import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();

    let startDate: Date;
    let endDate: Date = new Date(now);
    endDate.setHours(23, 59, 59, 999);

    const startParam = searchParams.get("startDate");
    const endParam = searchParams.get("endDate");
    const daysParam = parseInt(searchParams.get("days") || "14", 10);

    if (startParam && endParam) {
      startDate = new Date(startParam);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(endParam);
      endDate.setHours(23, 59, 59, 999);
    } else {
      const days = [7, 14, 30].includes(daysParam) ? daysParam : 14;
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - days + 1);
      startDate.setHours(0, 0, 0, 0);
    }

    const [captures, publications] = await Promise.all([
      prisma.vehicle.findMany({
        where: { capturedAt: { gte: startDate, lte: endDate } },
        select: { capturedAt: true },
      }),
      prisma.postHistory.findMany({
        where: { postedAt: { gte: startDate, lte: endDate }, success: true },
        select: { postedAt: true },
      }),
    ]);

    // Calculate number of days in range
    const msPerDay = 1000 * 60 * 60 * 24;
    const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / msPerDay) + 1;

    const chartData: { date: string; capturas: number; publicacoes: number }[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dayStr = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

      const capCount = captures.filter((c) => new Date(c.capturedAt).toISOString().slice(0, 10) === dayStr).length;
      const pubCount = publications.filter((p) => new Date(p.postedAt).toISOString().slice(0, 10) === dayStr).length;

      chartData.push({ date: label, capturas: capCount, publicacoes: pubCount });
    }

    return NextResponse.json(chartData);
  } catch (error) {
    console.error("[Dashboard Chart] Error:", error);
    return NextResponse.json(
      { error: "Erro ao carregar dados do grafico" },
      { status: 500 }
    );
  }
}
