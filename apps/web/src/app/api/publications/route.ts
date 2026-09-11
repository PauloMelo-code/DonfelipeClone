import { NextRequest, NextResponse } from "next/server";
import { and, or, eq, ilike, desc, count, type SQL } from "drizzle-orm";
import {
  db,
  historicoPublicacao,
  veiculos,
  gruposWhatsapp,
  usuarios,
  vivos,
} from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { comoTermoLike } from "@/lib/db/like";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";

    const condicoes: (SQL | undefined)[] = [vivos(historicoPublicacao)];
    if (status === "success") condicoes.push(eq(historicoPublicacao.success, true));
    else if (status === "failed") condicoes.push(eq(historicoPublicacao.success, false));

    if (search) {
      const termo = comoTermoLike(search);
      condicoes.push(or(ilike(veiculos.model, termo), ilike(veiculos.brand, termo)));
    }
    const filtro = and(...condicoes);

    const [linhas, [totalizador]] = await Promise.all([
      db
        .select({
          post: historicoPublicacao,
          vehicle: {
            id: veiculos.id,
            model: veiculos.model,
            brand: veiculos.brand,
            year: veiculos.year,
            km: veiculos.km,
            price: veiculos.price,
            sellingPrice: veiculos.sellingPrice,
            photos: veiculos.photos,
            formattedAd: veiculos.formattedAd,
          },
          targetGroup: { groupId: gruposWhatsapp.groupId, name: gruposWhatsapp.name },
          user: { id: usuarios.id, name: usuarios.name, email: usuarios.email },
        })
        .from(historicoPublicacao)
        .leftJoin(veiculos, eq(veiculos.id, historicoPublicacao.vehicleId))
        .leftJoin(gruposWhatsapp, eq(gruposWhatsapp.groupId, historicoPublicacao.targetGroupId))
        .leftJoin(usuarios, eq(usuarios.id, historicoPublicacao.userId))
        .where(filtro)
        .orderBy(desc(historicoPublicacao.postedAt))
        .offset((page - 1) * limit)
        .limit(limit),
      db
        .select({ n: count() })
        .from(historicoPublicacao)
        .leftJoin(veiculos, eq(veiculos.id, historicoPublicacao.vehicleId))
        .where(filtro),
    ]);

    const posts = linhas.map((l) => ({
      ...l.post,
      vehicle: l.vehicle?.id ? l.vehicle : null,
      targetGroup: l.targetGroup?.groupId ? l.targetGroup : null,
      user: l.user?.id ? l.user : null,
    }));
    const total = totalizador?.n ?? 0;

    return NextResponse.json({
      posts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[Publications] Error:", error);
    return NextResponse.json(
      { error: "Erro ao carregar historico de publicacoes" },
      { status: 500 }
    );
  }
}
