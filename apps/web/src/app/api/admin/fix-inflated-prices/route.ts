import { NextResponse } from "next/server";
import { or, eq, gt } from "drizzle-orm";
import { db, veiculos, carimboDeEdicao, vivosE } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/admin/fix-inflated-prices
 *
 * Corrige veiculos com price/fipePrice inflados por bug de parsing:
 * formato "78.200.00" (ponto duplo) era lido como 7.820.000 (multiplicado x100).
 *
 * Estrategia:
 *   - Busca veiculos com price OU fipePrice > R\$ 2.000.000
 *   - Divide por 100 (corrige o bug de remover virgula decimal)
 *   - Recalcula sellingPrice se houver
 *
 * Body opcional:
 *   - dryRun (default true): so conta, nao altera
 */
export async function POST(request: Request) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  let body: { dryRun?: boolean } = { dryRun: true };
  try {
    body = await request.json();
  } catch { /* sem body = dry run */ }
  const dryRun = body.dryRun !== false; // dryRun por padrao (seguranca)

  try {
    const SUSPECT = 2_000_000;

    // Veiculos com price OU fipePrice acima do limite suspeito
    const candidates = await db
      .select({
        id: veiculos.id,
        model: veiculos.model,
        year: veiculos.year,
        price: veiculos.price,
        fipePrice: veiculos.fipePrice,
        sellingPrice: veiculos.sellingPrice,
      })
      .from(veiculos)
      .where(
        vivosE(
          veiculos,
          or(
            gt(veiculos.price, SUSPECT),
            gt(veiculos.fipePrice, SUSPECT),
            gt(veiculos.sellingPrice, SUSPECT)
          )
        )
      );

    const samples: Array<{
      id: string;
      model: string;
      year: number;
      old: { price: number; fipePrice: number | null; sellingPrice: number | null };
      new: { price: number; fipePrice: number | null; sellingPrice: number | null };
    }> = [];

    let fixed = 0;
    for (const v of candidates) {
      const newPrice = v.price > SUSPECT ? Math.round(v.price / 100) : v.price;
      const newFipe = v.fipePrice && v.fipePrice > SUSPECT ? Math.round(v.fipePrice / 100) : v.fipePrice;
      const newSelling = v.sellingPrice && v.sellingPrice > SUSPECT ? Math.round(v.sellingPrice / 100) : v.sellingPrice;

      if (samples.length < 20) {
        samples.push({
          id: v.id,
          model: v.model,
          year: v.year,
          old: { price: v.price, fipePrice: v.fipePrice, sellingPrice: v.sellingPrice },
          new: { price: newPrice, fipePrice: newFipe, sellingPrice: newSelling },
        });
      }

      if (!dryRun) {
        await db
          .update(veiculos)
          .set({
            price: newPrice,
            fipePrice: newFipe,
            sellingPrice: newSelling,
            ...carimboDeEdicao(auth.user.id),
          })
          .where(vivosE(veiculos, eq(veiculos.id, v.id)));
        fixed++;
      }
    }

    return NextResponse.json({
      dryRun,
      candidates: candidates.length,
      fixed,
      samples,
      message: dryRun
        ? `[DRY RUN] ${candidates.length} veiculos seriam corrigidos. Mande dryRun:false pra aplicar.`
        : `${fixed} veiculos corrigidos.`,
    });
  } catch (error) {
    console.error("[fix-inflated-prices] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado" },
      { status: 500 }
    );
  }
}
