import { NextRequest, NextResponse } from "next/server";
import { gte, lte, count, desc } from "drizzle-orm";
import { db, veiculos, vivosE } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/dashboard/captures-by-state
 *
 * Retorna capturas agrupadas por estado (state) dentro de uma janela de tempo.
 * Default: ultimos 7 dias se nao for fornecido startDate/endDate.
 *
 * Cada veiculo conta UMA vez. Veiculos sem state vao pra "Outros" e apresentamos
 * separadamente pra nao bagunca o ranking dos estados conhecidos.
 *
 * Cache curto (60s) — relatorio nao precisa ser tempo-real.
 */
type CacheEntry = { data: unknown; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const startParam = searchParams.get("startDate");
    const endParam = searchParams.get("endDate");

    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setDate(defaultStart.getDate() - 6);
    defaultStart.setHours(0, 0, 0, 0);

    const startDate = startParam ? new Date(startParam) : defaultStart;
    const endDate = endParam ? new Date(endParam) : now;

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ error: "Datas invalidas" }, { status: 400 });
    }

    const cacheKey = `${startDate.toISOString()}|${endDate.toISOString()}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.data, { headers: { "X-Cache": "HIT" } });
    }

    const grouped = await db
      .select({ state: veiculos.state, total: count() })
      .from(veiculos)
      .where(vivosE(veiculos, gte(veiculos.capturedAt, startDate), lte(veiculos.capturedAt, endDate)))
      .groupBy(veiculos.state)
      .orderBy(desc(count()));

    let total = 0;
    let unknownCount = 0;
    const states: { state: string; count: number }[] = [];

    for (const g of grouped) {
      total += g.total;
      if (!g.state) {
        unknownCount += g.total;
        continue;
      }
      states.push({ state: g.state.toUpperCase(), count: g.total });
    }

    states.sort((a, b) => b.count - a.count);

    const payload = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      total,
      states,
      unknown: unknownCount,
    };

    cache.set(cacheKey, { data: payload, expiresAt: Date.now() + TTL_MS });
    return NextResponse.json(payload, { headers: { "X-Cache": "MISS" } });
  } catch (error) {
    console.error("[CapturesByState] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado" },
      { status: 500 }
    );
  }
}
