import { NextRequest, NextResponse } from "next/server";
import { or, ilike, desc } from "drizzle-orm";
import { db, veiculos, gruposWhatsapp, vivosE } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { comoTermoLike } from "@/lib/db/like";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const q = (request.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ vehicles: [], groups: [] });

  const termo = comoTermoLike(q);

  try {
    const [vehicles, groups] = await Promise.all([
      db
        .select({
          id: veiculos.id,
          model: veiculos.model,
          brand: veiculos.brand,
          year: veiculos.year,
          km: veiculos.km,
          price: veiculos.price,
          status: veiculos.status,
        })
        .from(veiculos)
        .where(
          vivosE(
            veiculos,
            or(
              ilike(veiculos.model, termo),
              ilike(veiculos.brand, termo),
              ilike(veiculos.plate, termo)
            )
          )
        )
        .orderBy(desc(veiculos.capturedAt))
        .limit(10),
      db
        .select({
          id: gruposWhatsapp.id,
          name: gruposWhatsapp.name,
          groupId: gruposWhatsapp.groupId,
          role: gruposWhatsapp.role,
        })
        .from(gruposWhatsapp)
        .where(vivosE(gruposWhatsapp, ilike(gruposWhatsapp.name, termo)))
        .limit(5),
    ]);

    return NextResponse.json({ vehicles, groups });
  } catch (error) {
    console.error("[search] Error:", error);
    return NextResponse.json({ vehicles: [], groups: [] }, { status: 500 });
  }
}
