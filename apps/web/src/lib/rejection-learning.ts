import { prisma } from "@/lib/prisma";

interface RejectionMatch {
  matched: boolean;
  reason?: string;
  similarCount?: number;
}

/**
 * Verifica se um veiculo similar foi rejeitado >= 3 vezes nos ultimos 30 dias.
 * Retorna o motivo mais comum se sim.
 */
export async function checkRejectionPattern(vehicle: {
  model: string;
  year: number;
  km: number;
  fipePrice?: number | null;
  price: number;
  sourceGroupId?: string | null;
}): Promise<RejectionMatch> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Busca rejeitados similares (mesmo modelo, ano +/- 1, km proximo)
  const modelKey = vehicle.model.toLowerCase().split(" ").slice(0, 3).join(" ");
  const similarRejected = await prisma.vehicle.findMany({
    where: {
      status: "REJECTED",
      rejectedAt: { gte: thirtyDaysAgo },
      year: { gte: vehicle.year - 1, lte: vehicle.year + 1 },
      km: { gte: vehicle.km * 0.8, lte: vehicle.km * 1.2 },
    },
    select: { model: true, rejectionTags: true },
    take: 50,
  });

  // Filtra por similaridade de modelo
  const sameModel = similarRejected.filter((v) => {
    const vKey = v.model.toLowerCase().split(" ").slice(0, 3).join(" ");
    return vKey === modelKey;
  });

  if (sameModel.length < 3) return { matched: false };

  // Encontra tag mais comum
  const tagCount = new Map<string, number>();
  for (const v of sameModel) {
    if (!v.rejectionTags) continue;
    try {
      const tags: string[] = JSON.parse(v.rejectionTags);
      for (const t of tags) tagCount.set(t, (tagCount.get(t) || 0) + 1);
    } catch { /* ignore */ }
  }

  let topTag: string | null = null;
  let topCount = 0;
  for (const [tag, count] of tagCount.entries()) {
    if (count > topCount) { topTag = tag; topCount = count; }
  }

  return {
    matched: true,
    reason: topTag || "padrao_repetido",
    similarCount: sameModel.length,
  };
}

/**
 * Verifica se modelo do veiculo está em blocklist (palavra-chave).
 */
export async function checkBlocklist(rawDescription: string): Promise<string | null> {
  const setting = await prisma.setting.findUnique({ where: { key: "blocklist_keywords" } });
  if (!setting?.value) return null;
  const keywords = setting.value.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
  const lower = rawDescription.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}
