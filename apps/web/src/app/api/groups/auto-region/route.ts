import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

function detectRegion(name: string): string | null {
  const n = name.toLowerCase();

  // RS patterns
  if (
    /\b(poa|porto\s*alegre|canoas|caxias|navegantes|zona\s*(norte|sul)|pantanal|rio\s*grande\s*do\s*sul)\b/.test(n) ||
    /\brs\b/.test(n) ||
    /\b(sm|santa\s*maria)\b/.test(n)
  ) {
    return "RS";
  }

  // SC patterns
  if (
    /\b(floripa|florian[oó]polis|joinville|jlle|itaja[ií]|blumenau|porto\s*belo)\b/.test(n) ||
    /\bsc\b/.test(n) ||
    /\b(bc)\b/.test(n) ||
    /\b(sul\s*sc|norte\s*sul)\b/.test(n)
  ) {
    return "SC";
  }

  // PR patterns
  if (
    /\b(curitiba|cwb|guarapuava|maring[aá]|londrina)\b/.test(n) ||
    /\bpr\b/.test(n)
  ) {
    return "PR";
  }

  // Nacional/SP
  if (/\b(brasil|global|nacional)\b/.test(n)) return "Nacional";
  if (/\bsp\b/.test(n)) return "SP";

  return null;
}

export async function POST() {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const groups = await prisma.whatsAppGroup.findMany({
      where: { region: null },
      select: { id: true, name: true },
    });

    let tagged = 0;
    const results: { name: string; region: string }[] = [];

    for (const g of groups) {
      const region = detectRegion(g.name);
      if (region) {
        await prisma.whatsAppGroup.update({
          where: { id: g.id },
          data: { region },
        });
        tagged++;
        results.push({ name: g.name, region });
      }
    }

    return NextResponse.json({
      total: groups.length,
      tagged,
      results,
      message: `${tagged} grupos taggeados automaticamente`,
    });
  } catch (error) {
    console.error("[auto-region] Error:", error);
    return NextResponse.json(
      { error: "Erro ao taguear grupos" },
      { status: 500 }
    );
  }
}
