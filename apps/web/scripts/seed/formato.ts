import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Como o anuncio fica antes e depois de passar pelo sistema.
//
// `rawWhatsApp` imita o que chega dos grupos de repasse: caixa alta, emoji
// solto e marca da loja concorrente. `formatAd` mostra o resultado limpo.
// O contraste entre os dois e o que a demonstracao precisa mostrar.
// ---------------------------------------------------------------------------

/** Identidade do veiculo, usada pra nao capturar o mesmo carro duas vezes. */
export function hash(model: string, year: number, km: number, price: number) {
  return createHash("md5")
    .update(`${model.trim().toUpperCase()}|${year}|${km}|${price}`)
    .digest("hex");
}

/** Uma data no passado, com hora comercial sorteada. */
export function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60));
  return d;
}

export function formatAd(v: {
  model: string;
  year: number;
  yearModel?: number;
  km: number;
  price: number;
  fipePrice?: number;
  transmission?: string;
  fuel?: string;
  features: string[];
  margin: number;
}): string {
  const sellingPrice = v.price * (1 + v.margin / 100);
  const shortModel = v.model.split(/\s+/).slice(0, 2).join(" ").toUpperCase();
  const yShort = String(v.year).slice(-2);
  const kmFmt = v.km.toLocaleString("pt-BR");
  const thousands = sellingPrice / 1000;
  const pShort = Number.isInteger(thousands)
    ? `${thousands}k`
    : `${thousands.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`;

  let transmissionLabel = "AUT";
  if (v.fuel === "HIBRIDO") transmissionLabel = "HIBRIDO";
  else if (v.transmission === "MANUAL") transmissionLabel = "MEC";
  else if (v.transmission === "CVT") transmissionLabel = "CVT";

  const yearDisplay = v.yearModel ? `${v.year}/${v.yearModel}` : `${v.year}`;
  const featuresBlock = v.features.map((f) => `\u2022 ${f}`).join("\n");
  const fipeLine = v.fipePrice ? `FIPE: R$ ${Math.round(v.fipePrice).toLocaleString("pt-BR")}` : null;
  const sellingFmt = `R$ ${Math.round(sellingPrice).toLocaleString("pt-BR")}`;

  const lines = [
    `\uD83D\uDE97 ${shortModel} '${yShort} | ${kmFmt} KM | ${pShort}`,
    "",
    `${v.model.toUpperCase()} ${transmissionLabel}`,
    `Ano: ${yearDisplay}`,
    `Km: ${kmFmt}`,
  ];
  if (featuresBlock) lines.push("", featuresBlock);
  lines.push("");
  if (fipeLine) lines.push(fipeLine);
  lines.push(`POR: ${sellingFmt}`);
  return lines.join("\n");
}

/**
 * Generate a realistic messy WhatsApp raw message like a real dealer would send.
 * These are intentionally unformatted with mixed case, random emojis, and competitor branding.
 */
export function rawWhatsApp(v: {
  model: string; brand: string; year: number; yearModel?: number;
  km: number; price: number; fipePrice?: number;
  transmission?: string; fuel?: string; color?: string;
  features: string[]; plate?: string | null;
}, index: number): string {
  const templates = [
    // Style 1: ALL CAPS aggressive
    () => `\u{1F525}\u{1F525} REPASSE \u{1F525}\u{1F525}

${v.brand} ${v.model}
${v.year}/${v.yearModel || v.year}
${v.km.toLocaleString("pt-BR")}KM
COR: ${v.color?.toUpperCase() || "N/I"}
${v.transmission === "AUTOMATICO" ? "(AUT.)" : v.transmission === "MANUAL" ? "(MEC.)" : v.transmission === "CVT" ? "(CVT)" : "(AUT.)"}
${v.features.slice(0, 3).join(" / ")}

VALOR: R$ ${v.price.toLocaleString("pt-BR")},00
${v.fipePrice ? `FIPE: R$ ${v.fipePrice.toLocaleString("pt-BR")},00` : ""}

\u{1F4DE} CHAMA NO ZAP
\u{2705} ACEITO TROCA
\u{1F4CD} CURITIBA-PR

@REPASSES_SUL_OFICIAL`,

    // Style 2: casual lower with competitor watermark
    () => `repasse disponivel \u{1F697}

${v.brand?.toLowerCase()} ${v.model.toLowerCase()}
ano ${v.year}${v.yearModel ? `/${v.yearModel}` : ""}
km ${v.km.toLocaleString("pt-BR")}
${v.color?.toLowerCase() || ""}
${v.transmission?.toLowerCase() || "automatico"}
${v.fuel?.toLowerCase() || "flex"}

itens: ${v.features.slice(0, 4).join(", ").toLowerCase()}

valor R$${v.price.toLocaleString("pt-BR")}

\u{2B07}\u{FE0F}\u{2B07}\u{FE0F} interessados chama inbox \u{2B07}\u{FE0F}\u{2B07}\u{FE0F}

\u{00A9} MEGA REPASSES PR`,

    // Style 3: emoji heavy
    () => `\u{1F697}\u{1F4A8} OPORTUNIDADE \u{1F4A8}\u{1F697}

\u{2705} ${v.brand} ${v.model}
\u{1F4C5} ${v.year}/${v.yearModel || v.year}
\u{1F4CF} ${v.km.toLocaleString("pt-BR")} km
\u{1F3A8} ${v.color || ""}
\u{2699}\u{FE0F} ${v.transmission || "Automatico"} - ${v.fuel || "Flex"}

${v.features.map(f => `\u{1F539} ${f}`).join("\n")}

\u{1F4B0} R$ ${v.price.toLocaleString("pt-BR")}
${v.fipePrice ? `\u{1F4CA} Fipe R$ ${v.fipePrice.toLocaleString("pt-BR")}` : ""}

\u{1F4F2} (41) 99XXX-XXXX
\u{1F501} Aceito troca com volta
\u{1F4CD} Regiao Metropolitana CWB

#repasses #${v.brand?.toLowerCase().replace(/\s/g,"")} #seminovos`,

    // Style 4: minimal/rushed
    () => `${v.brand} ${v.model} ${v.year}${v.yearModel ? `/${String(v.yearModel).slice(-2)}` : ""}
${v.km}km ${v.color || ""}
${v.transmission === "MANUAL" ? "mec" : "aut"} ${v.fuel?.toLowerCase() || "flex"}
${v.features.slice(0, 2).join(", ")}
${v.price.toLocaleString("pt-BR")}
${v.plate ? `placa ${v.plate.charAt(v.plate.length - 1)}` : ""}
Interessados chama`,

    // Style 5: formal competitor
    () => `\u{1F4CB} FICHA TECNICA

Veiculo: ${v.brand} ${v.model}
Ano/Modelo: ${v.year}/${v.yearModel || v.year}
Quilometragem: ${v.km.toLocaleString("pt-BR")} km
Combustivel: ${v.fuel || "Flex"}
Cambio: ${v.transmission === "AUTOMATICO" ? "Automatico" : v.transmission === "MANUAL" ? "Manual" : v.transmission || "Automatico"}
Cor: ${v.color || "N/I"}

Opcionais:
${v.features.map(f => `- ${f}`).join("\n")}

\u{1F4B2} Valor: R$ ${v.price.toLocaleString("pt-BR")},00
${v.fipePrice ? `\u{1F4CA} Tabela FIPE: R$ ${v.fipePrice.toLocaleString("pt-BR")},00` : ""}

\u{26A0}\u{FE0F} Veiculo de repasse - sujeito a disponibilidade
\u{1F4DE} Contato via WhatsApp

>>> AUTO REPASSES JOINVILLE <<<`,
  ];

  return templates[index % templates.length]();
}
