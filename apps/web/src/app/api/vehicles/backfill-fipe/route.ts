import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

/**
 * Extract FIPE price from rawDescription using regex patterns.
 * Common formats in Brazilian vehicle ads:
 *   "Fipe 76.500"  "fipe R$ 85.000"  "FIPE: 120.000,00"  "tabela fipe 95mil"
 *   "fipe: 177.530"  "📊 Fipe R$ 76.500"
 */
function extractFipeFromText(text: string): number | null {
  // Normalize: remove emojis, extra spaces
  const clean = text.replace(/[\u{1F000}-\u{1FFFF}]/gu, "").trim();

  // Pattern: "fipe" followed by optional separators then a price
  const patterns = [
    /fipe\s*:?\s*r?\$?\s*([\d.,]+)\s*(mil|reais)?/i,
    /tabela\s+fipe\s*:?\s*r?\$?\s*([\d.,]+)\s*(mil|reais)?/i,
  ];

  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match) {
      let raw = match[1];
      const suffix = match[2]?.toLowerCase();

      // Handle "85mil" or "85.5mil"
      if (suffix === "mil") {
        raw = raw.replace(",", ".");
        const num = parseFloat(raw);
        if (!isNaN(num)) return num * 1000;
      }

      // Handle "76.500" or "76.500,00" (Brazilian format)
      // Remove dots (thousands separator), replace comma with dot (decimal)
      const hasBrazilianDecimals = /,\d{2}$/.test(raw);
      if (hasBrazilianDecimals) {
        raw = raw.replace(/\./g, "").replace(",", ".");
      } else {
        raw = raw.replace(/\./g, "").replace(",", ".");
      }

      const num = parseFloat(raw);
      if (!isNaN(num) && num >= 1000) return num;
    }
  }

  return null;
}

/**
 * POST /api/vehicles/backfill-fipe
 * Backfill fipePrice for all vehicles where fipePrice is null
 * and rawDescription contains a FIPE reference.
 */
export async function POST() {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const vehicles = await prisma.vehicle.findMany({
      where: {
        fipePrice: null,
        rawDescription: { not: null },
      },
      select: { id: true, rawDescription: true },
    });

    let updated = 0;

    for (const v of vehicles) {
      if (!v.rawDescription) continue;
      const fipe = extractFipeFromText(v.rawDescription);
      if (fipe) {
        await prisma.vehicle.update({
          where: { id: v.id },
          data: { fipePrice: fipe },
        });
        updated++;
        console.log(`[backfill-fipe] ${v.id}: ${fipe}`);
      }
    }

    return NextResponse.json({
      total: vehicles.length,
      updated,
      message: `${updated} veículos atualizados com FIPE`,
    });
  } catch (error) {
    console.error("[backfill-fipe] Error:", error);
    return NextResponse.json({ error: "Erro ao atualizar FIPE" }, { status: 500 });
  }
}
