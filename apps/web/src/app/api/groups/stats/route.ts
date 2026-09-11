import { NextRequest, NextResponse } from "next/server";
import { and, or, eq, like, isNull, count, type SQL } from "drizzle-orm";
import { db, gruposWhatsapp, vivos } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/groups/stats?role=SOURCE|TARGET
 *
 * Retorna contagem por tipo de chat (grupo, canal, comunidade, lista, contato)
 * pra mostrar nas pills de filtro da tela /grupos.
 *
 * Cache em-memoria (15s) -- contadores nao precisam ser ao vivo.
 */
type StatsByType = {
  todos: number;
  grupo: number;
  canal: number;
  comunidade: number;
  lista: number;
  contato: number;
};

const statsCache = new Map<string, { data: StatsByType; expiresAt: number }>();
const TTL_MS = 15_000;

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role");

  const cacheKey = role ?? "ALL";
  const cached = statsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data, { headers: { "X-Cache": "HIT" } });
  }

  const base: (SQL | undefined)[] = [vivos(gruposWhatsapp)];
  if (role && role !== "ALL") base.push(eq(gruposWhatsapp.role, role));

  const contar = async (filtro: SQL | undefined) => {
    const [r] = await db.select({ n: count() }).from(gruposWhatsapp).where(filtro);
    return r?.n ?? 0;
  };

  // kindOverride tem prioridade -- conta primeiro por override.
  // Pro resto (kindOverride null), aplica regra natural por sufixo do JID.
  const porTipo = (automatico: SQL, chave: string) =>
    and(...base, or(eq(gruposWhatsapp.kindOverride, chave), and(isNull(gruposWhatsapp.kindOverride), automatico)));

  try {
    const [todos, canal, comunidade, lista, contato, grupo] = await Promise.all([
      contar(and(...base)),
      contar(porTipo(like(gruposWhatsapp.groupId, "%@newsletter"), "canal")),
      contar(
        porTipo(
          and(like(gruposWhatsapp.groupId, "%@g.us"), eq(gruposWhatsapp.isCommunity, true)) as SQL,
          "comunidade"
        )
      ),
      contar(porTipo(like(gruposWhatsapp.groupId, "%@broadcast"), "lista")),
      contar(
        porTipo(
          or(
            eq(gruposWhatsapp.isContact, true),
            like(gruposWhatsapp.groupId, "%@s.whatsapp.net")
          ) as SQL,
          "contato"
        )
      ),
      contar(
        porTipo(
          and(
            like(gruposWhatsapp.groupId, "%@g.us"),
            eq(gruposWhatsapp.isCommunity, false),
            eq(gruposWhatsapp.isContact, false)
          ) as SQL,
          "grupo"
        )
      ),
    ]);

    const stats: StatsByType = { todos, grupo, canal, comunidade, lista, contato };
    statsCache.set(cacheKey, { data: stats, expiresAt: Date.now() + TTL_MS });

    return NextResponse.json(stats, { headers: { "X-Cache": "MISS" } });
  } catch (error) {
    console.error("[GroupsStats] Error:", error);
    return NextResponse.json(
      { error: "Erro ao calcular estatisticas" },
      { status: 500 }
    );
  }
}

export function invalidateStatsCache() {
  statsCache.clear();
}
