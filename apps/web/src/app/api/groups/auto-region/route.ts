import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, gruposWhatsapp, carimboDeEdicao, vivos, vivosE } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// Known group names mapped to regions (from client list)
const KNOWN_GROUPS: Record<string, string> = {
  // RS groups
  "repasse fmv": "RS", "marcão repasses": "RS", "repasses one": "RS",
  "zottis": "RS", "carro dez": "RS", "vaapty porto alegre": "RS",
  "vaapty navegantes": "RS", "vaapty poa": "RS", "4you repasses": "RS",
  "repassei veículos": "RS", "repassei veiculos": "RS", "compro seu veículo": "RS",
  "compro seu veiculo": "RS", "connect repasses": "RS", "auto repasse rs": "RS",
  "guilherme selistre": "RS", "vaapty canoas": "RS", "empire motors": "RS",
  "speed auto repasse": "RS", "duarte": "RS", "carpix": "RS", "swiftcar": "RS",
  "zolet": "RS", "na hora car": "RS", "next repasses": "RS", "go repasses": "RS",
  "luiz ricardo": "RS", "pantanal repasses": "RS", "isadoro": "RS", "isidoro": "RS",
  "oportunidade felipe": "RS", "auto ck rio grande": "RS", "silveira repasses": "RS",
  "quality repasses": "RS", "c2 repasses": "RS", "plus repasses": "RS",
  "tts motors": "RS", "trato feito": "RS", "fabiano repassador": "RS",
  "andrezão": "RS", "andrezao": "RS", "guilherme repasses": "RS",
  // SC groups
  "repasse grupo geração": "SC", "repasse grupo geracao": "SC",
  "dani repasses floripa": "SC", "vaapty itajaí": "SC", "vaapty itajai": "SC",
  "wa repasses": "SC", "joão matos": "SC", "joao matos": "SC",
  "preto repassador": "SC", "repasse sul sc": "SC", "valley intermediações": "SC",
  "valley intermediacoes": "SC", "norte sul repasses": "SC", "provenzi": "SC",
  "eduardo repasses": "SC", "repasses blumenau": "SC", "auto sul repasses": "SC",
  "bc consultoria": "SC", "auto prime": "SC", "dg premium": "SC",
  "baumann": "SC", "lr autocar": "SC", "vaapty jlle": "SC", "vaapty joinville": "SC",
  "ns repasses": "SC", "sg repasses": "SC", "bc premium": "SC", "auto ck": "SC",
  "repasse bc": "SC", "central de negócios": "SC", "central de negocios": "SC",
  "vm repasses": "SC", "braz repasses": "SC", "ramon": "SC", "l car": "SC",
  // PR groups
  "vaapty guarapuava": "PR", "global repasses": "PR",
  "fl repasse curitiba": "PR", "fr repasses curitiba": "PR",
  "curitiba auto repasse": "PR", "cwb repasse": "PR", "cwb - repasse": "PR",
  "vendas exclusiva maringa": "PR", "vaapty maringa": "PR", "vaapty maringá": "PR",
  "vip car": "PR",
};

function detectRegion(name: string): string | null {
  const n = name.toLowerCase();

  // 1. Check known group name patterns (partial match)
  for (const [pattern, region] of Object.entries(KNOWN_GROUPS)) {
    if (n.includes(pattern)) return region;
  }

  // 2. Regex fallback for general patterns
  // RS
  if (
    /\b(poa|porto\s*alegre|canoas|caxias|navegantes|zona\s*(norte|sul)|pantanal|rio\s*grande\s*do\s*sul)\b/.test(n) ||
    /\brs\b/.test(n) ||
    /\b(santa\s*maria)\b/.test(n)
  ) {
    return "RS";
  }

  // SC
  if (
    /\b(floripa|florian[oó]polis|joinville|jlle|itaja[ií]|blumenau|porto\s*belo)\b/.test(n) ||
    /\bsc\b/.test(n) ||
    /\b(bc)\b/.test(n)
  ) {
    return "SC";
  }

  // PR
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
    // Tag ALL groups (not just null) — overwrites with better detection
    const groups = await db
      .select({
        id: gruposWhatsapp.id,
        name: gruposWhatsapp.name,
        region: gruposWhatsapp.region,
      })
      .from(gruposWhatsapp)
      .where(vivos(gruposWhatsapp));

    let tagged = 0;
    const results: { name: string; region: string }[] = [];

    for (const g of groups) {
      const region = detectRegion(g.name);
      if (region) {
        await db
          .update(gruposWhatsapp)
          .set({ region, ...carimboDeEdicao(auth.user.id) })
          .where(vivosE(gruposWhatsapp, eq(gruposWhatsapp.id, g.id)));
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
