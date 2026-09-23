import { NextRequest, NextResponse } from "next/server";
import { and, gte, lte, eq } from "drizzle-orm";
import { db, veiculos, historicoPublicacao, vivos } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { FUSO, diaLocal } from "@/lib/dia";

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
      db
        .select({ capturedAt: veiculos.capturedAt })
        .from(veiculos)
        .where(
          and(vivos(veiculos), gte(veiculos.capturedAt, startDate), lte(veiculos.capturedAt, endDate))
        ),
      db
        .select({ postedAt: historicoPublicacao.postedAt })
        .from(historicoPublicacao)
        .where(
          and(
            vivos(historicoPublicacao),
            gte(historicoPublicacao.postedAt, startDate),
            lte(historicoPublicacao.postedAt, endDate),
            eq(historicoPublicacao.success, true)
          )
        ),
    ]);

    // Calculate number of days in range
    const msPerDay = 1000 * 60 * 60 * 24;
    const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / msPerDay) + 1;

    const chartData: { date: string; capturas: number; publicacoes: number }[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      // O dia da barra e o dia do cliente: com o corte em UTC, a captura da
      // noite caia na barra do dia seguinte.
      const dayStr = diaLocal(d);
      const label = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: FUSO });

      const capCount = captures.filter((c) => diaLocal(new Date(c.capturedAt)) === dayStr).length;
      const pubCount = publications.filter((p) => diaLocal(new Date(p.postedAt)) === dayStr).length;

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
