import { NextResponse } from "next/server";
import { eq, ne, gte, lte, ilike, inArray, isNotNull, desc as ordemDesc } from "drizzle-orm";
import { db, veiculos, vivosE } from "@/lib/db";
import { comoTermoLike } from "@/lib/db/like";
import { lerConfiguracaoNumero } from "@/lib/settings";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/vehicles/:id/insights
 *
 * Retorna analise inteligente do veiculo combinando varios sinais:
 *  - Quality Score (foto + texto + preco vs FIPE)
 *  - Comparativo de mercado (carros similares no DB)
 *  - Sugestao de preco ideal
 *  - Probabilidade de venda (heuristica)
 *  - Pontos fortes e atencoes
 *
 * Tudo em memoria do DB -- sem chamar IA aqui (mantem custo zero por consulta).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;

  try {
    const [vehicle] = await db
      .select()
      .from(veiculos)
      .where(vivosE(veiculos, eq(veiculos.id, id)))
      .limit(1);
    if (!vehicle) {
      return NextResponse.json({ error: "Veiculo nao encontrado" }, { status: 404 });
    }

    // Photo analysis
    let photoCategories: string[] = [];
    try {
      photoCategories = vehicle.photoCategories
        ? JSON.parse(vehicle.photoCategories)
        : [];
    } catch { /* ignore */ }
    let photos: string[] = [];
    try {
      photos = JSON.parse(vehicle.photos);
    } catch { /* ignore */ }

    const heroCategory = photoCategories[0] || "outro";
    const exteriorCount = photoCategories.filter((c) => c === "exterior").length;
    const interiorCount = photoCategories.filter((c) => c === "interior").length;

    // Score de FOTO (0-10)
    let photoScore = 5;
    if (heroCategory === "exterior") photoScore += 3;
    else if (heroCategory === "interior" || heroCategory === "detalhe") photoScore -= 2;
    else if (heroCategory === "screenshot") photoScore -= 4;
    if (photos.length >= 4) photoScore += 1.5;
    else if (photos.length >= 2) photoScore += 0.5;
    if (exteriorCount >= 2) photoScore += 0.5;
    photoScore = Math.max(0, Math.min(10, photoScore));

    // Score de TEXTO (0-10) -- mais completo = melhor
    let textScore = 5;
    const desc = vehicle.rawDescription || "";
    if (desc.length > 150) textScore += 1.5;
    if (desc.length > 300) textScore += 1;
    if (vehicle.transmission) textScore += 0.5;
    if (vehicle.fuel) textScore += 0.5;
    if (vehicle.color) textScore += 0.5;
    if (vehicle.location || vehicle.state) textScore += 0.5;
    if (/revis[ão|oes|ad]/i.test(desc)) textScore += 0.5;
    if (/dono\s*único|único\s*dono/i.test(desc)) textScore += 0.5;
    textScore = Math.max(0, Math.min(10, textScore));

    // Score de PRECO vs FIPE (0-10)
    let priceScore = 5;
    let discountPct: number | null = null;
    if (vehicle.fipePrice && vehicle.fipePrice > 0 && vehicle.price > 0) {
      discountPct = Math.round((1 - vehicle.price / vehicle.fipePrice) * 100);
      if (discountPct >= 20) priceScore = 10;
      else if (discountPct >= 15) priceScore = 9;
      else if (discountPct >= 10) priceScore = 7;
      else if (discountPct >= 5) priceScore = 5;
      else if (discountPct >= 0) priceScore = 3;
      else priceScore = 1;
    }

    // Score COMBINADO (peso: 30% foto, 25% texto, 45% preco)
    const overallScore =
      photoScore * 0.30 +
      textScore * 0.25 +
      priceScore * 0.45;

    // Comparativo de mercado: veiculos similares no DB
    // Mesma marca/modelo (primeira palavra), ano +/- 1, status = APPROVED/PUBLISHED/SOLD
    const modelFirstWord = vehicle.model.split(" ")[0]?.toUpperCase();
    const similar = modelFirstWord
      ? await db
          .select({
            sellingPrice: veiculos.sellingPrice,
            km: veiculos.km,
            soldAt: veiculos.soldAt,
          })
          .from(veiculos)
          .where(
            vivosE(
              veiculos,
              ne(veiculos.id, id),
              ilike(veiculos.model, comoTermoLike(modelFirstWord)),
              gte(veiculos.year, vehicle.year - 1),
              lte(veiculos.year, vehicle.year + 1),
              inArray(veiculos.status, ["APPROVED", "PUBLISHED", "SOLD"]),
              isNotNull(veiculos.sellingPrice)
            )
          )
          .orderBy(ordemDesc(veiculos.capturedAt))
          .limit(50)
      : [];

    let marketAvg: number | null = null;
    let marketMin: number | null = null;
    let marketMax: number | null = null;
    let soldCount = 0;
    if (similar.length > 0) {
      const prices = similar.map((s) => s.sellingPrice!).filter((p) => p > 0);
      if (prices.length > 0) {
        marketAvg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
        marketMin = Math.min(...prices);
        marketMax = Math.max(...prices);
      }
      soldCount = similar.filter((s) => s.soldAt !== null).length;
    }

    // Probabilidade de venda (heuristica simples)
    let saleProbability = 50;
    if (discountPct !== null && discountPct >= 15) saleProbability += 25;
    else if (discountPct !== null && discountPct >= 10) saleProbability += 15;
    else if (discountPct !== null && discountPct < 5) saleProbability -= 20;
    if (vehicle.km > 0 && vehicle.km < 50000) saleProbability += 10;
    else if (vehicle.km > 150000) saleProbability -= 10;
    if (photoScore >= 8) saleProbability += 5;
    else if (photoScore < 5) saleProbability -= 10;
    if (soldCount >= 3) saleProbability += 5; // modelo "quente" historicamente
    saleProbability = Math.max(5, Math.min(95, saleProbability));

    // Pontos fortes e atencoes
    const strengths: string[] = [];
    const warnings: string[] = [];

    if (discountPct !== null && discountPct >= 15) strengths.push(`Preço ${discountPct}% abaixo da FIPE`);
    else if (discountPct !== null && discountPct >= 10) strengths.push(`Bom desconto (${discountPct}% FIPE)`);
    if (vehicle.km > 0 && vehicle.km < 50000) strengths.push("KM baixa (< 50.000)");
    if (heroCategory === "exterior") strengths.push("Foto destaque correta (exterior)");
    if (photos.length >= 5) strengths.push(`${photos.length} fotos do veículo`);
    if (vehicle.isVip) strengths.push("Modelo VIP");
    if (vehicle.qualityScore && vehicle.qualityScore >= 8) strengths.push("Score IA alto (≥ 8)");

    if (heroCategory === "interior") warnings.push("Foto destaque é da INTERNA — considere trocar");
    if (heroCategory === "detalhe" || heroCategory === "motor") warnings.push("Foto destaque não mostra o carro inteiro");
    if (heroCategory === "screenshot") warnings.push("Foto destaque é screenshot — substitua");
    if (photos.length === 1) warnings.push("Apenas 1 foto — anúncios com 4+ vendem melhor");
    if (discountPct !== null && discountPct < 5) warnings.push("Margem baixa vs FIPE");
    if (vehicle.km > 150000) warnings.push("KM alta");

    // Sugestao de preco ideal: media de mercado dos vendidos OU preco atual + margem padrao
    const defaultMargin = await lerConfiguracaoNumero("profit_margin_percent", 10);
    const suggestedPrice = marketAvg
      ? Math.round((vehicle.price * (1 + defaultMargin / 100) + marketAvg) / 2)
      : Math.round(vehicle.price * (1 + defaultMargin / 100));

    return NextResponse.json({
      scores: {
        overall: Math.round(overallScore * 10) / 10,
        photo: Math.round(photoScore * 10) / 10,
        text: Math.round(textScore * 10) / 10,
        price: Math.round(priceScore * 10) / 10,
      },
      photo: {
        heroCategory,
        categories: photoCategories,
        exteriorCount,
        interiorCount,
        totalPhotos: photos.length,
      },
      pricing: {
        captured: vehicle.price,
        fipe: vehicle.fipePrice,
        discountPct,
        suggested: suggestedPrice,
        currentSelling: vehicle.sellingPrice,
      },
      market: {
        similarCount: similar.length,
        avg: marketAvg,
        min: marketMin,
        max: marketMax,
        soldCount,
      },
      saleProbability,
      strengths,
      warnings,
    });
  } catch (error) {
    console.error("[Insights] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado" },
      { status: 500 }
    );
  }
}
