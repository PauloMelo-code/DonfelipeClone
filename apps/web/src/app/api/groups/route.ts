import { NextRequest, NextResponse } from "next/server";
import {
  and,
  or,
  eq,
  isNull,
  ilike,
  like,
  asc,
  desc,
  count,
  sql,
  getTableColumns,
  type SQL,
} from "drizzle-orm";
import {
  db,
  gruposWhatsapp,
  GRUPO_REVIVIDO,
  carimboDeEdicao,
  veiculos,
  historicoPublicacao,
  vivos,
} from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { comoTermoLike } from "@/lib/db/like";
import { validateBody } from "@/lib/validate";
import { createGroupSchema } from "@/lib/validations";
import { invalidateStatsCache } from "./stats/route";

// In-memory cache for groups list (groups change rarely, hot read path).
// Cleared on any mutation in POST/PUT/DELETE handlers.
type CachedGroupsEntry = { data: unknown; expiresAt: number };
const groupsCache = new Map<string, CachedGroupsEntry>();
const GROUPS_CACHE_TTL_MS = 30_000;

export function invalidateGroupsCache() {
  groupsCache.clear();
  // Invalida tambem o cache de contagens por tipo pra refletir mudancas
  // imediatamente nas pills da tela /grupos.
  invalidateStatsCache();
}

/** Colunas do grupo + os dois contadores que a tela usa, como subconsulta. */
const colunasComContagem = {
  ...getTableColumns(gruposWhatsapp),
  sourceVehiclesCount: sql<number>`(select count(*)::int from ${veiculos} where ${veiculos.sourceGroupId} = ${gruposWhatsapp.groupId} and ${veiculos.isDeleted} = false)`,
  targetPostsCount: sql<number>`(select count(*)::int from ${historicoPublicacao} where ${historicoPublicacao.targetGroupId} = ${gruposWhatsapp.groupId} and ${historicoPublicacao.isDeleted} = false)`,
};

type LinhaGrupo = Record<string, unknown> & {
  filters?: string | null;
  sourceVehiclesCount?: number;
  targetPostsCount?: number;
};

/** Mesma forma que a tela ja consome: filters parseado e _count aninhado. */
function paraTela(g: LinhaGrupo, comContagem: boolean) {
  const { sourceVehiclesCount, targetPostsCount, ...resto } = g;
  return {
    ...resto,
    filters: g.filters ? JSON.parse(g.filters) : null,
    ...(comContagem
      ? {
          _count: {
            sourceVehicles: sourceVehiclesCount ?? 0,
            targetPosts: targetPostsCount ?? 0,
          },
        }
      : {}),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");
    const active = searchParams.get("active");
    const search = searchParams.get("search")?.trim() || "";
    const region = searchParams.get("region");
    // type: grupo|canal|comunidade|lista|contato. Sem param = todos.
    const type = searchParams.get("type");
    // ?counts=false skips the expensive count aggregates.
    const includeCounts = searchParams.get("counts") !== "false";
    // Pagination is opt-in: if `page` is present, return { groups, pagination }.
    // Otherwise return the legacy flat array (backward compat for publish modal).
    const pageParam = searchParams.get("page");
    const paginated = pageParam !== null;
    const page = Math.max(1, parseInt(pageParam || "1", 10));
    const limit = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("limit") || "50", 10))
    );

    const cacheKey = [
      role ?? "ALL",
      active ?? "ANY",
      includeCounts ? "C" : "N",
      search,
      region ?? "ALL",
      type ?? "ALLT",
      paginated ? `P${page}x${limit}` : "FULL",
    ].join("|");
    const cached = groupsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.data, { headers: { "X-Cache": "HIT" } });
    }

    const condicoes: (SQL | undefined)[] = [vivos(gruposWhatsapp)];
    if (role && role !== "ALL") condicoes.push(eq(gruposWhatsapp.role, role));
    if (active !== null && active !== undefined && active !== "") {
      condicoes.push(eq(gruposWhatsapp.active, active === "true"));
    }
    if (search) condicoes.push(ilike(gruposWhatsapp.name, comoTermoLike(search)));
    if (region) {
      condicoes.push(
        region === "" ? isNull(gruposWhatsapp.region) : eq(gruposWhatsapp.region, region)
      );
    }

    // Filtro de tipo. kindOverride tem prioridade sobre a regra automatica.
    // Regra automatica (quando kindOverride is null):
    //   @newsletter -> canal
    //   @broadcast  -> lista
    //   @s.whatsapp.net -> contato
    //   @g.us + isCommunity -> comunidade
    //   @g.us padrao -> grupo
    if (type && type !== "todos") {
      const autoMatch: Record<string, SQL | undefined> = {
        canal: like(gruposWhatsapp.groupId, "%@newsletter"),
        comunidade: and(
          like(gruposWhatsapp.groupId, "%@g.us"),
          eq(gruposWhatsapp.isCommunity, true)
        ),
        lista: like(gruposWhatsapp.groupId, "%@broadcast"),
        contato: or(
          eq(gruposWhatsapp.isContact, true),
          like(gruposWhatsapp.groupId, "%@s.whatsapp.net")
        ),
        grupo: and(
          like(gruposWhatsapp.groupId, "%@g.us"),
          eq(gruposWhatsapp.isCommunity, false),
          eq(gruposWhatsapp.isContact, false)
        ),
      };

      const auto = autoMatch[type];
      if (auto) {
        // (kindOverride = X) OR (kindOverride null AND classificacao natural = X)
        condicoes.push(
          or(eq(gruposWhatsapp.kindOverride, type), and(isNull(gruposWhatsapp.kindOverride), auto))
        );
      }
    }

    const filtro = and(...condicoes);
    const colunas = includeCounts ? colunasComContagem : getTableColumns(gruposWhatsapp);

    if (paginated) {
      const [groups, [totalizador]] = await Promise.all([
        db
          .select(colunas)
          .from(gruposWhatsapp)
          .where(filtro)
          // Ativos sempre primeiro, depois alfabetico.
          // Vale igual pra SOURCE e TARGET: desativados nunca misturam com ativos.
          .orderBy(desc(gruposWhatsapp.active), asc(gruposWhatsapp.name))
          .offset((page - 1) * limit)
          .limit(limit),
        db.select({ n: count() }).from(gruposWhatsapp).where(filtro),
      ]);

      const total = totalizador?.n ?? 0;
      const payload = {
        groups: groups.map((g) => paraTela(g as LinhaGrupo, includeCounts)),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      };

      groupsCache.set(cacheKey, {
        data: payload,
        expiresAt: Date.now() + GROUPS_CACHE_TTL_MS,
      });
      return NextResponse.json(payload, { headers: { "X-Cache": "MISS" } });
    }

    // Legacy flat-array path (publish modal, batch publish, etc.)
    const groups = await db
      .select(colunas)
      .from(gruposWhatsapp)
      .where(filtro)
      .orderBy(asc(gruposWhatsapp.name));

    const parsed = groups.map((g) => paraTela(g as LinhaGrupo, includeCounts));

    groupsCache.set(cacheKey, {
      data: parsed,
      expiresAt: Date.now() + GROUPS_CACHE_TTL_MS,
    });
    return NextResponse.json(parsed, { headers: { "X-Cache": "MISS" } });
  } catch (error) {
    console.error("[Groups] Error fetching groups:", error);
    return NextResponse.json({ error: "Erro ao buscar grupos" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const body = await request.json();
    const validation = validateBody(createGroupSchema, body);
    if (!validation.success) return validation.response;

    const { groupId, name, role, active, filters, photoUrl, region } = validation.data;

    const [existing] = await db
      .select({ id: gruposWhatsapp.id })
      .from(gruposWhatsapp)
      // So grupo VIVO bloqueia: o excluido e cadastrado de novo logo abaixo.
      .where(and(vivos(gruposWhatsapp), eq(gruposWhatsapp.groupId, groupId)))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: "Grupo ja cadastrado", existingId: existing.id },
        { status: 409 }
      );
    }

    const novo = {
      groupId,
      name,
      role,
      active: active ?? true,
      filters: filters || null,
      photoUrl,
      region: region || null,
    };
    const [group] = await db
      .insert(gruposWhatsapp)
      .values({ ...novo, modifiedBy: auth.user.id })
      // Revive o grupo excluido com o mesmo JID, ver GRUPO_REVIVIDO.
      .onConflictDoUpdate({
        target: gruposWhatsapp.groupId,
        set: { ...GRUPO_REVIVIDO, ...novo, ...carimboDeEdicao(auth.user.id) },
      })
      .returning();

    invalidateGroupsCache();

    return NextResponse.json(
      {
        ...group,
        filters: group.filters ? JSON.parse(group.filters) : null,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Groups] Error creating group:", error);
    return NextResponse.json({ error: "Erro ao criar grupo" }, { status: 500 });
  }
}
