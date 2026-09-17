import { NextResponse } from "next/server";
import { eq, isNotNull } from "drizzle-orm";
import { db, veiculos, carimboDeEdicao, vivosE } from "@/lib/db";
import { lerConfiguracaoNumero } from "@/lib/settings";
import { requireAuth } from "@/lib/auth";
import { extractVehicleFromTextNoCache } from "@/lib/ai";
import { formatVehicleAd } from "@/lib/vehicle-formatter";
import { cleanAdDescription } from "@/lib/ad-cleaner";
import { isModelLikelyBad } from "@/lib/ai/prompt";

/**
 * POST /api/admin/fix-vehicle-names
 *
 * Procura veiculos cujo modelo no DB e uma CHAMADA PROMOCIONAL (e.g.
 * "Menor valor Brasil", "CAARPIX PORTO ALEGRE") ao inves do modelo real.
 * Re-extrai do rawDescription usando o extractor v2 (com PROMO_PHRASES
 * filtradas) e atualiza model/brand. Tambem regera o formattedAd.
 *
 * Body:
 *   - dryRun (default true): conta sem alterar
 */

/** Uma lista so de chamada/loja/cabecalho, a mesma que a IA usa. */
function isBadModelName(name: string): boolean {
  const n = (name ?? "").trim();
  return n.length < 3 || isModelLikelyBad(n);
}

export async function POST(request: Request) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  let body: { dryRun?: boolean } = { dryRun: true };
  try { body = await request.json(); } catch { /* sem body = dryRun */ }
  const dryRun = body.dryRun !== false;

  try {
    // Busca veiculos suspeitos: model que parece chamada promocional E
    // que tenham rawDescription pra re-extrair.
    const all = await db
      .select({
        id: veiculos.id,
        model: veiculos.model,
        brand: veiculos.brand,
        formattedAd: veiculos.formattedAd,
        rawDescription: veiculos.rawDescription,
        price: veiculos.price,
        fipePrice: veiculos.fipePrice,
        sellingPrice: veiculos.sellingPrice,
        year: veiculos.year,
        yearModel: veiculos.yearModel,
        km: veiculos.km,
        transmission: veiculos.transmission,
        fuel: veiculos.fuel,
        features: veiculos.features,
      })
      .from(veiculos)
      .where(vivosE(veiculos, isNotNull(veiculos.rawDescription)));

    const isBadKm = (km: number) => km < 1000;
    const isBadYear = (y: number) => y < 1990 || y > new Date().getFullYear() + 1;
    // FIPE null + 2+ valores R$ no rawDescription = candidato a normalizacao
    const hasMultipleUnlabeledPrices = (v: { fipePrice: number | null; rawDescription: string | null }) => {
      if (v.fipePrice) return false;
      if (!v.rawDescription) return false;
      const matches = v.rawDescription.match(/r\$\s*[\d][\d.,]*/gi) || [];
      return matches.length >= 2;
    };
    const candidates = all.filter((v) =>
      isBadModelName(v.model) || isBadKm(v.km) || isBadYear(v.year) || hasMultipleUnlabeledPrices(v)
    );

    // Margem global pra regenerar formattedAd
    const margin = await lerConfiguracaoNumero("profit_margin_percent", 10);

    let fixed = 0;
    let skipped = 0;
    const samples: Array<{
      id: string;
      oldModel: string;
      newModel: string | null;
      brand: string | null;
    }> = [];

    for (const v of candidates) {
      if (!v.rawDescription) {
        skipped++;
        continue;
      }
      const extracted = await extractVehicleFromTextNoCache(v.rawDescription);
      if (!extracted) {
        skipped++;
        continue;
      }

      // Coleta mudancas possiveis
      const updates: Record<string, unknown> = {};
      let willChange = false;

      // Modelo
      if (isBadModelName(v.model) && extracted.model && !isBadModelName(extracted.model)) {
        updates.model = extracted.model;
        updates.brand = extracted.brand ?? v.brand;
        willChange = true;
      }
      // KM
      if (isBadKm(v.km) && typeof extracted.km === "number" && !isBadKm(extracted.km)) {
        updates.km = extracted.km;
        willChange = true;
      }
      // Year
      if (isBadYear(v.year) && extracted.year && !isBadYear(extracted.year)) {
        updates.year = extracted.year;
        if (extracted.yearModel) updates.yearModel = extracted.yearModel;
        willChange = true;
      }
      // FIPE + price (caso BMW 220i sem rotulo)
      if (!v.fipePrice && extracted.fipePrice && extracted.fipePrice > 0) {
        updates.fipePrice = extracted.fipePrice;
        willChange = true;
        // Se o price atual e igual a fipe extraida, corrige o price tambem
        if (extracted.price && extracted.price !== extracted.fipePrice &&
            (v.price === extracted.fipePrice || v.price > extracted.price * 1.05)) {
          updates.price = extracted.price;
        }
      }

      if (!willChange) {
        skipped++;
        continue;
      }
      const newModel = (updates.model as string) || v.model;

      // Re-roda cleaner + formatter pra gerar formattedAd novo
      let newFormattedAd: string | null = null;
      try {
        const cleanedDesc = await cleanAdDescription(v.rawDescription);
        let features: string[] = [];
        try { features = JSON.parse(v.features || "[]"); } catch { /* ignore */ }
        newFormattedAd = formatVehicleAd(
          {
            model: newModel,
            brand: ((updates.brand as string) ?? v.brand),
            year: (updates.year as number) ?? v.year,
            yearModel: (updates.yearModel as number) ?? v.yearModel,
            km: (updates.km as number) ?? v.km,
            price: v.price,
            fipePrice: v.fipePrice,
            transmission: v.transmission,
            fuel: v.fuel,
            features,
            rawDescription: cleanedDesc || v.rawDescription,
          },
          { profitMarginPercent: margin }
        );
      } catch { /* cleaner falhou, mas ainda atualiza modelo */ }

      if (samples.length < 20) {
        samples.push({
          id: v.id,
          oldModel: v.model,
          newModel,
          brand: (extracted?.brand ?? v.brand),
        });
      }

      if (!dryRun) {
        await db
          .update(veiculos)
          .set({
            ...updates,
            ...(newFormattedAd ? { formattedAd: newFormattedAd } : {}),
            ...carimboDeEdicao(auth.user.id),
          })
          .where(vivosE(veiculos, eq(veiculos.id, v.id)));
      }
      fixed++;
    }

    return NextResponse.json({
      dryRun,
      total: all.length,
      candidates: candidates.length,
      fixed,
      skipped,
      samples,
      message: dryRun
        ? `[DRY RUN] ${candidates.length} candidatos, ${fixed} podem ser corrigidos. Mande dryRun:false pra aplicar.`
        : `${fixed} modelos corrigidos.`,
    });
  } catch (error) {
    console.error("[fix-vehicle-names] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado" },
      { status: 500 }
    );
  }
}
