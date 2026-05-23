import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
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
    // Filtra server-side pra paginacao funcionar corretamente quando o
    // usuario escolhe um tipo especifico.
    const type = searchParams.get("type");
    // ?counts=false skips the expensive _count aggregates.
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
      return NextResponse.json(cached.data, {
        headers: { "X-Cache": "HIT" },
      });
    }

    const where: Record<string, unknown> = {};
    if (role && role !== "ALL") where.role = role;
    if (active !== null && active !== undefined && active !== "") {
      where.active = active === "true";
    }
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }
    if (region) {
      where.region = region === "" ? null : region;
    }

    // Filtro de tipo (mesma logica que getGroupType no client).
    // Ordem importa: canal/contato/comunidade/lista checados antes de "grupo"
    // pra evitar que um canal com JID @g.us caia em "grupo".
    if (type && type !== "todos") {
      if (type === "canal") {
        where.OR = [
          { isAnnounce: true },
          { groupId: { endsWith: "@newsletter" } },
        ];
      } else if (type === "comunidade") {
        where.isCommunity = true;
      } else if (type === "lista") {
        where.groupId = { endsWith: "@broadcast" };
      } else if (type === "contato") {
        where.OR = [
          { isContact: true },
          { groupId: { endsWith: "@s.whatsapp.net" } },
        ];
      } else if (type === "grupo") {
        // "Grupo comum" = @g.us sem flag de canal/comunidade
        where.AND = [
          { groupId: { endsWith: "@g.us" } },
          { isAnnounce: false },
          { isCommunity: false },
          { isContact: false },
        ];
      }
    }

    if (paginated) {
      const [groups, total] = await Promise.all([
        prisma.whatsAppGroup.findMany({
          where,
          ...(includeCounts
            ? {
                include: {
                  _count: { select: { sourceVehicles: true, targetPosts: true } },
                },
              }
            : {}),
          // Ativos sempre primeiro, depois alfabetico.
          // Vale igual pra SOURCE e TARGET -- desativados nunca misturam com ativos.
          orderBy: [{ active: "desc" }, { name: "asc" }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.whatsAppGroup.count({ where }),
      ]);

      const parsed = groups.map((g) => ({
        ...g,
        filters: g.filters ? JSON.parse(g.filters) : null,
      }));

      const payload = {
        groups: parsed,
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
    const groups = await prisma.whatsAppGroup.findMany({
      where,
      ...(includeCounts
        ? {
            include: {
              _count: { select: { sourceVehicles: true, targetPosts: true } },
            },
          }
        : {}),
      orderBy: { name: "asc" },
    });

    const parsed = groups.map((g) => ({
      ...g,
      filters: g.filters ? JSON.parse(g.filters) : null,
    }));

    groupsCache.set(cacheKey, {
      data: parsed,
      expiresAt: Date.now() + GROUPS_CACHE_TTL_MS,
    });

    return NextResponse.json(parsed, { headers: { "X-Cache": "MISS" } });
  } catch (error) {
    console.error("[Groups] Error listing groups:", error);
    return NextResponse.json(
      { error: "Erro ao listar grupos" },
      { status: 500 }
    );
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

    const existing = await prisma.whatsAppGroup.findUnique({
      where: { groupId },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Grupo ja cadastrado", existingId: existing.id },
        { status: 409 }
      );
    }

    const group = await prisma.whatsAppGroup.create({
      data: {
        groupId,
        name,
        role,
        active: active ?? true,
        filters: filters || null,
        photoUrl,
        region: region || null,
      },
    });

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
    return NextResponse.json(
      { error: "Erro ao criar grupo" },
      { status: 500 }
    );
  }
}
