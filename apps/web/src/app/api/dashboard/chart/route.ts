import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const now = new Date();
    const days = 14;
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);

    // Fetch captures and publications for the last 14 days
    const [captures, publications] = await Promise.all([
      prisma.vehicle.findMany({
        where: { capturedAt: { gte: startDate } },
        select: { capturedAt: true },
      }),
      prisma.postHistory.findMany({
        where: { postedAt: { gte: startDate }, success: true },
        select: { postedAt: true },
      }),
    ]);

    // Group by day
    const chartData: { date: string; capturas: number; publicacoes: number }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dayStr = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

      const capCount = captures.filter((c) => {
        const cd = new Date(c.capturedAt);
        return cd.toISOString().slice(0, 10) === dayStr;
      }).length;

      const pubCount = publications.filter((p) => {
        const pd = new Date(p.postedAt);
        return pd.toISOString().slice(0, 10) === dayStr;
      }).length;

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
