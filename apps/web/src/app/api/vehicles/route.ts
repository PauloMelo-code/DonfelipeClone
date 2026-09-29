import { NextRequest, NextResponse } from "next/server";
import { and, or, eq, ilike, inArray, isNull, isNotNull, asc, desc, count, sql, getTableColumns, type SQL } from "drizzle-orm";
import { db, veiculos, gruposWhatsapp, historicoPublicacao, vivos } from "@/lib/db";
import { comoTermoLike } from "@/lib/db/like";
import { generateVehicleHash } from "@/lib/deduplication";
import { ordenarComRepetidosJuntos, type LugarNoGrupo } from "@/lib/repetidos";
import { requireAuth } from "@/lib/auth";
import { validateBody } from "@/lib/validate";
import { createVehicleSchema } from "@/lib/validations";

const ALLOWED_SORT_FIELDS = [
  "capturedAt",
  "price",
  "km",
  "year",
  "model",
  "status",
  "approvedAt",
  "publishedAt",
  "preparedAt",
];

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    // prepared filter:
    //   "true"  -> apenas veiculos com preparedAt != null (aba "Prontos")
    //   "false" -> apenas com preparedAt == null (aba "Aprovados" sem os prontos)
    //   absent  -> sem filtro
    const preparedParam = searchParams.get("prepared");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const sortBy = ALLOWED_SORT_FIELDS.includes(searchParams.get("sortBy") || "")
      ? searchParams.get("sortBy")!
      : "capturedAt";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

    const condicoes: (SQL | undefined)[] = [vivos(veiculos)];

    if (status && status !== "ALL") {
      condicoes.push(eq(veiculos.status, status));
    }

    if (preparedParam === "true") {
      condicoes.push(isNotNull(veiculos.preparedAt));
    } else if (preparedParam === "false") {
      condicoes.push(isNull(veiculos.preparedAt));
    }

    if (search) {
      const termo = comoTermoLike(search);
      condicoes.push(
        or(
          ilike(veiculos.model, termo),
          ilike(veiculos.brand, termo),
          ilike(veiculos.plate, termo),
          ilike(veiculos.rawDescription, termo)
        )
      );
    }

    const filtro = and(...condicoes);
    const colunaOrdem = {
      capturedAt: veiculos.capturedAt,
      price: veiculos.price,
      km: veiculos.km,
      year: veiculos.year,
      model: veiculos.model,
      status: veiculos.status,
      approvedAt: veiculos.approvedAt,
      publishedAt: veiculos.publishedAt,
      preparedAt: veiculos.preparedAt,
    }[sortBy] ?? veiculos.capturedAt;

    // ── Repetidos lado a lado ────────────────────────────────────────────
    //
    // Pedido do cliente (26/09/2026): quando varios fornecedores postam o
    // MESMO carro, os cards tem que aparecer juntos, do mais barato pro mais
    // caro, pra ele bater o olho e ver quem esta oferecendo melhor.
    //
    // O agrupamento roda sobre a fila INTEIRA e so depois a pagina e cortada.
    // Agrupar so dentro da pagina deixaria o par do outro lado da virada e a
    // tela mentiria dizendo que nao ha repetido.
    let ordemAgrupada: string[] | null = null;
    const grupos = new Map<string, LugarNoGrupo>();
    if (searchParams.get("agrupar")) {
      const leves = await db
        .select({
          id: veiculos.id,
          model: veiculos.model,
          km: veiculos.km,
          price: veiculos.price,
          fipePrice: veiculos.fipePrice,
          capturedAt: veiculos.capturedAt,
        })
        .from(veiculos)
        .where(filtro);
      const r = ordenarComRepetidosJuntos(
        leves.map((v) => ({ ...v, capturedAt: v.capturedAt.toISOString() }))
      );
      ordemAgrupada = r.ordenados.map((v) => v.id);
      for (const [id, lugar] of r.grupos) grupos.set(id, lugar);
    }

    const idsDaPagina = ordemAgrupada?.slice((page - 1) * limit, page * limit) ?? null;

    const [linhas, [totalizador]] = await Promise.all([
      db
        .select({
          ...getTableColumns(veiculos),
          grupoNome: gruposWhatsapp.name,
          grupoJid: gruposWhatsapp.groupId,
          grupoComunidade: gruposWhatsapp.isCommunity,
          grupoCanal: gruposWhatsapp.isAnnounce,
          grupoContato: gruposWhatsapp.isContact,
          grupoTipoManual: gruposWhatsapp.kindOverride,
          grupoTelefone: gruposWhatsapp.ownerPhone,
          grupoRegiao: gruposWhatsapp.region,
          totalPublicacoes: sql<number>`(select count(*)::int from ${historicoPublicacao} where ${historicoPublicacao.vehicleId} = ${veiculos.id} and ${historicoPublicacao.isDeleted} = false)`,
        })
        .from(veiculos)
        .leftJoin(gruposWhatsapp, eq(gruposWhatsapp.groupId, veiculos.sourceGroupId))
        // Agrupado: a pagina ja foi escolhida acima, entao busca por id. A
        // ordem do banco nao vale aqui -- ela e reposta logo abaixo.
        .where(idsDaPagina ? and(filtro, inArray(veiculos.id, idsDaPagina)) : filtro)
        .orderBy(sortOrder === "asc" ? asc(colunaOrdem) : desc(colunaOrdem))
        .offset(idsDaPagina ? 0 : (page - 1) * limit)
        .limit(limit),
      db.select({ n: count() }).from(veiculos).where(filtro),
    ]);

    const total = totalizador?.n ?? 0;

    // `inArray` volta na ordem do banco; a ordem que importa e a do agrupamento.
    if (idsDaPagina) {
      const porId = new Map(linhas.map((l) => [l.id, l]));
      linhas.length = 0;
      for (const id of idsDaPagina) {
        const l = porId.get(id);
        if (l) linhas.push(l);
      }
    }

    // Mesma forma que a tela ja consome: sourceGroup e _count aninhados.
    const vehicles = linhas.map(
      ({ grupoNome, grupoJid, grupoComunidade, grupoCanal, grupoContato, grupoTipoManual, grupoTelefone, grupoRegiao, totalPublicacoes, ...v }) => ({
        ...v,
        sourceGroup: grupoJid
          ? {
              name: grupoNome as string,
              groupId: grupoJid,
              isCommunity: grupoComunidade as boolean,
              isAnnounce: grupoCanal as boolean,
              isContact: grupoContato as boolean,
              kindOverride: grupoTipoManual,
              ownerPhone: grupoTelefone,
              region: grupoRegiao,
            }
          : null,
        _count: { postHistory: totalPublicacoes },
        // Presente so nos que TEM par. Card sem isto nao e repetido.
        repetido: grupos.get(v.id) ?? null,
      })
    );

    const safeParseArray = (s: string | null | undefined): unknown[] => {
      if (!s) return [];
      try { return JSON.parse(s); } catch { return []; }
    };
    const parsed = vehicles.map((v) => ({
      ...v,
      features: safeParseArray(v.features),
      photos: safeParseArray(v.photos),
    }));

    return NextResponse.json({
      vehicles: parsed,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[Vehicles] Error listing vehicles:", error);
    return NextResponse.json(
      { error: "Erro ao listar veiculos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const body = await request.json();
    const validation = validateBody(createVehicleSchema, body);
    if (!validation.success) return validation.response;

    const {
      model,
      brand,
      year,
      yearModel,
      km,
      price,
      sellingPrice,
      fipePrice,
      transmission,
      fuel,
      color,
      plate,
      features,
      photos,
      rawDescription,
      sourceGroupId,
      sourceMessageId,
      sellerPhone,
    } = validation.data;

    const vehicleHash = generateVehicleHash({
      model,
      year,
      km,
      price,
    });

    const [existing] = await db
      .select({ id: veiculos.id })
      .from(veiculos)
      .where(and(vivos(veiculos), eq(veiculos.vehicleHash, vehicleHash)))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: "Veiculo duplicado detectado", existingId: existing.id },
        { status: 409 }
      );
    }

    const [vehicle] = await db
      .insert(veiculos)
      .values({
        model,
        brand,
        year,
        yearModel: yearModel || year,
        km,
        price,
        sellingPrice,
        fipePrice,
        transmission,
        fuel,
        color,
        plate,
        features: JSON.stringify(features || []),
        photos: JSON.stringify(photos || []),
        rawDescription,
        sourceGroupId,
        sourceMessageId,
        sellerPhone,
        vehicleHash,
        status: "PENDING",
        modifiedBy: auth.user.id,
      })
      .returning();

    return NextResponse.json(vehicle, { status: 201 });
  } catch (error) {
    console.error("[Vehicles] Error creating vehicle:", error);
    return NextResponse.json(
      { error: "Erro ao criar veiculo" },
      { status: 500 }
    );
  }
}
