import { NextRequest, NextResponse } from "next/server";
import { or, eq, ne, gte, lte, ilike } from "drizzle-orm";
import { db, veiculos, gruposWhatsapp, vivosE } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { comoTermoLike } from "@/lib/db/like";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  const [v] = await db
    .select()
    .from(veiculos)
    .where(vivosE(veiculos, eq(veiculos.id, id)))
    .limit(1);
  if (!v) return NextResponse.json({ error: "Veiculo nao encontrado" }, { status: 404 });

  const modelKey = v.model.toLowerCase().split(" ").slice(0, 2).join(" ");
  const sessentaDias = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const linhas = await db
    .select({
      id: veiculos.id,
      model: veiculos.model,
      year: veiculos.year,
      km: veiculos.km,
      price: veiculos.price,
      photoHash: veiculos.photoHash,
      status: veiculos.status,
      capturedAt: veiculos.capturedAt,
      sourceGroupName: gruposWhatsapp.name,
    })
    .from(veiculos)
    .leftJoin(gruposWhatsapp, eq(gruposWhatsapp.groupId, veiculos.sourceGroupId))
    .where(
      vivosE(
        veiculos,
        ne(veiculos.id, id),
        gte(veiculos.year, v.year - 1),
        lte(veiculos.year, v.year + 1),
        gte(veiculos.km, Math.floor(v.km * 0.7)),
        lte(veiculos.km, Math.ceil(v.km * 1.3)),
        gte(veiculos.capturedAt, sessentaDias),
        // Mesma foto OU mesmo prefixo de modelo
        v.photoHash
          ? or(eq(veiculos.photoHash, v.photoHash), ilike(veiculos.model, comoTermoLike(modelKey)))
          : ilike(veiculos.model, comoTermoLike(modelKey))
      )
    )
    .limit(10);

  // Mesma forma que a tela consome: sourceGroup aninhado.
  const similar = linhas.map(({ sourceGroupName, ...v }) => ({
    ...v,
    sourceGroup: sourceGroupName ? { name: sourceGroupName } : null,
  }));

  return NextResponse.json({ similar });
}
