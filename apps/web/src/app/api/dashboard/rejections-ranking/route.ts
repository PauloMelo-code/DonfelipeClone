import { NextRequest, NextResponse } from "next/server";
import { eq, gte, lte, desc } from "drizzle-orm";
import { db, veiculos, gruposWhatsapp, vivosE } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/dashboard/rejections-ranking?startDate=...&endDate=...
 *
 * Ranking de rejeitados num intervalo. Retorna 3 listas:
 *   1. Top motivos (rejection_tags mais usados)
 *   2. Top modelos rejeitados
 *   3. Top fontes (grupos) que mais geram rejeicao
 *
 * Cache curto (60s) -- relatorio nao precisa ser tempo real.
 */
type CacheEntry = { data: unknown; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

const TAG_LABELS: Record<string, string> = {
  fora_padrao: "Fora do padrão",
  sem_margem: "Sem margem",
  fora_sul: "Fora do Sul",
  repetido: "Repetido",
  km_alta: "Km alta",
  modelo_mais_margem: "Precisa mais margem",
  sem_foto: "Sem foto / foto errada",
  leilao_pouca_margem: "Leilão pouca margem",
  sem_valor_oferta: "Sem valor da oferta",
  muitos_reparos_pouca_margem: "Muitos reparos + pouca margem",
};

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const startParam = searchParams.get("startDate");
    const endParam = searchParams.get("endDate");

    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setDate(defaultStart.getDate() - 29);
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

    const filtro = vivosE(
      veiculos,
      eq(veiculos.status, "REJECTED"),
      gte(veiculos.rejectedAt, startDate),
      lte(veiculos.rejectedAt, endDate)
    );

    // Pull a sample of rejected vehicles to extract aggregations
    // Limitado a 2000 pra nao explodir memoria; tipico operador rejeita
    // dezenas/centenas por mes, nao milhares.
    const linhas = await db
      .select({
        id: veiculos.id,
        model: veiculos.model,
        brand: veiculos.brand,
        rejectionTags: veiculos.rejectionTags,
        sourceGroupId: veiculos.sourceGroupId,
        grupoId: gruposWhatsapp.groupId,
        grupoNome: gruposWhatsapp.name,
      })
      .from(veiculos)
      .leftJoin(gruposWhatsapp, eq(gruposWhatsapp.groupId, veiculos.sourceGroupId))
      .where(filtro)
      .orderBy(desc(veiculos.rejectedAt))
      .limit(2000);

    // Mesma forma que o restante do handler consome: sourceGroup aninhado.
    const rejected = linhas.map(({ grupoId, grupoNome, ...v }) => ({
      ...v,
      sourceGroup: grupoId ? { groupId: grupoId, name: grupoNome as string } : null,
    }));

    const total = rejected.length;

    // 1. Top tags
    const tagCount = new Map<string, number>();
    for (const v of rejected) {
      if (!v.rejectionTags) continue;
      try {
        const tags: string[] = JSON.parse(v.rejectionTags);
        for (const t of tags) tagCount.set(t, (tagCount.get(t) || 0) + 1);
      } catch { /* ignore */ }
    }
    const topTags = Array.from(tagCount.entries())
      .map(([tag, count]) => ({ tag, label: TAG_LABELS[tag] || tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 2. Top modelos rejeitados (normaliza pra evitar variacao de espaco/case)
    const modelCount = new Map<string, { count: number; brand: string | null }>();
    for (const v of rejected) {
      const norm = v.model.trim().toUpperCase().replace(/\s+/g, " ");
      const key = v.brand ? `${v.brand.trim().toUpperCase()}|${norm}` : norm;
      const existing = modelCount.get(key);
      if (existing) existing.count++;
      else modelCount.set(key, { count: 1, brand: v.brand });
    }
    const topModels = Array.from(modelCount.entries())
      .map(([key, info]) => {
        const parts = key.split("|");
        return {
          model: parts.length === 2 ? parts[1] : parts[0],
          brand: info.brand,
          count: info.count,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 3. Top fontes (grupos) que mais geram rejeicao
    const sourceCount = new Map<string, { count: number; name: string }>();
    for (const v of rejected) {
      if (!v.sourceGroup) continue;
      const id = v.sourceGroup.groupId;
      const existing = sourceCount.get(id);
      if (existing) existing.count++;
      else sourceCount.set(id, { count: 1, name: v.sourceGroup.name });
    }
    const topSources = Array.from(sourceCount.entries())
      .map(([groupId, info]) => ({ groupId, name: info.name, count: info.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const payload = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      total,
      topTags,
      topModels,
      topSources,
    };

    cache.set(cacheKey, { data: payload, expiresAt: Date.now() + TTL_MS });
    return NextResponse.json(payload, { headers: { "X-Cache": "MISS" } });
  } catch (error) {
    console.error("[RejectionsRanking] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado" },
      { status: 500 }
    );
  }
}
