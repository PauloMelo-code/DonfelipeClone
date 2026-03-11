import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";

const prisma = new PrismaClient();

function hash(model: string, year: number, km: number, price: number) {
  return createHash("md5")
    .update(`${model.trim().toUpperCase()}|${year}|${km}|${price}`)
    .digest("hex");
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60));
  return d;
}

function formatAd(v: {
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
function rawWhatsApp(v: {
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

async function main() {
  console.log("Seeding Cugini database with demo data...\n");

  // ---- Clean existing data ----
  await prisma.auditLog.deleteMany();
  await prisma.postHistory.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.whatsAppGroup.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.user.deleteMany();
  console.log("Cleaned existing data.");

  // ---- User ----
  const hashedPassword = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.create({
    data: {
      email: "admin@cugini.com.br",
      name: "Paulo Vitor",
      password: hashedPassword,
      role: "ADMIN",
    },
  });
  console.log("Admin:", admin.email);

  // ---- Settings ----
  const settings = [
    { key: "profit_margin_percent", value: "10" },
    { key: "delay_min_seconds", value: "30" },
    { key: "delay_max_seconds", value: "120" },
    { key: "filter_min_year", value: "2010" },
    { key: "filter_max_price", value: "300000" },
    { key: "auction_emoji", value: "\uD83D\uDE97" },
  ];
  for (const s of settings) {
    await prisma.setting.create({ data: s });
  }
  console.log("Settings:", settings.length);

  // ---- WhatsApp Groups ----
  const sourceGroups = await Promise.all([
    prisma.whatsAppGroup.create({
      data: {
        groupId: "120363044556789@g.us",
        name: "Repasses PR/SC - Premium",
        role: "SOURCE",
        active: true,
        filters: JSON.stringify({ minYear: 2015, maxPrice: 250000 }),
      },
    }),
    prisma.whatsAppGroup.create({
      data: {
        groupId: "120363055667788@g.us",
        name: "Repasses SUL - Seminovos",
        role: "SOURCE",
        active: true,
        filters: JSON.stringify({ minYear: 2012, maxPrice: 200000 }),
      },
    }),
    prisma.whatsAppGroup.create({
      data: {
        groupId: "120363066778899@g.us",
        name: "Repasses Curitiba e Regiao",
        role: "SOURCE",
        active: true,
        filters: JSON.stringify({ minYear: 2014 }),
      },
    }),
    prisma.whatsAppGroup.create({
      data: {
        groupId: "120363077889900@g.us",
        name: "Repasses SC - Floripa/Joinville",
        role: "SOURCE",
        active: false,
        filters: null,
      },
    }),
  ]);

  const targetGroups = await Promise.all([
    prisma.whatsAppGroup.create({
      data: {
        groupId: "120363088990011@g.us",
        name: "Cugini Repasses - Ofertas",
        role: "TARGET",
        active: true,
      },
    }),
    prisma.whatsAppGroup.create({
      data: {
        groupId: "120363099001122@g.us",
        name: "Cugini Repasses - Premium",
        role: "TARGET",
        active: true,
      },
    }),
    prisma.whatsAppGroup.create({
      data: {
        groupId: "120363011223344@g.us",
        name: "Cugini Repasses - SUL",
        role: "TARGET",
        active: true,
      },
    }),
  ]);
  console.log("Groups: SOURCE=" + sourceGroups.length + " TARGET=" + targetGroups.length);

  // ---- Vehicles ----
  const margin = 10;
  const vehiclesData = [
    // PUBLISHED (8 vehicles)
    {
      model: "Civic EXL 2.0 16V", brand: "HONDA", year: 2022, yearModel: 2022,
      km: 28000, price: 135000, fipePrice: 142000,
      transmission: "CVT", fuel: "FLEX", color: "Preto", plate: "BRA2E19",
      features: ["Teto Solar", "Bancos em Couro", "Multimidia", "Camera de Re", "Sensor de Estacionamento", "Keyless"],
      photos: ["https://images.unsplash.com/photo-1679239872706-e05d630d1989?w=600&h=400&fit=crop"],
      status: "PUBLISHED", capturedDaysAgo: 7, approvedDaysAgo: 6, publishedDaysAgo: 5,
    },
    {
      model: "Corolla XEi 2.0 Direct", brand: "TOYOTA", year: 2023, yearModel: 2024,
      km: 15000, price: 145000, fipePrice: 155000,
      transmission: "CVT", fuel: "FLEX", color: "Branco Perola", plate: "RDG5H78",
      features: ["Piloto Automatico", "Ar Digital", "Bancos em Couro", "Central Multimidia 9\"", "LED", "7 Airbags"],
      photos: ["https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=600&h=400&fit=crop"],
      status: "PUBLISHED", capturedDaysAgo: 5, approvedDaysAgo: 4, publishedDaysAgo: 3,
    },
    {
      model: "HRV EXL 1.5 Turbo", brand: "HONDA", year: 2023, yearModel: 2023,
      km: 22000, price: 155000, fipePrice: 165000,
      transmission: "CVT", fuel: "FLEX", color: "Cinza", plate: "QRF4G56",
      features: ["Teto Solar Panoramico", "Bancos em Couro", "Honda Sensing", "Carplay/Android Auto", "LED"],
      photos: ["https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=600&h=400&fit=crop"],
      status: "PUBLISHED", capturedDaysAgo: 6, approvedDaysAgo: 5, publishedDaysAgo: 4,
    },
    {
      model: "T-Cross Highline 1.4 TSI", brand: "VOLKSWAGEN", year: 2022, yearModel: 2023,
      km: 35000, price: 128000, fipePrice: 136000,
      transmission: "AUTOMATICO", fuel: "FLEX", color: "Azul", plate: "MTD3F45",
      features: ["Teto Solar", "Multimidia", "Camera de Re", "Sensor Dianteiro/Traseiro", "Keyless"],
      photos: ["https://images.unsplash.com/photo-1606611013016-969c19ba27a5?w=600&h=400&fit=crop"],
      status: "PUBLISHED", capturedDaysAgo: 10, approvedDaysAgo: 9, publishedDaysAgo: 8,
    },
    {
      model: "Tracker Premier 1.2 Turbo", brand: "CHEVROLET", year: 2022, yearModel: 2022,
      km: 42000, price: 115000, fipePrice: 123000,
      transmission: "AUTOMATICO", fuel: "FLEX", color: "Branco", plate: "RDC2E34",
      features: ["Wi-Fi", "Carplay", "Camera 360", "Piloto Automatico", "6 Airbags"],
      photos: ["https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=600&h=400&fit=crop"],
      status: "PUBLISHED", capturedDaysAgo: 8, approvedDaysAgo: 7, publishedDaysAgo: 6,
    },
    {
      model: "Compass Limited 1.3 T270", brand: "JEEP", year: 2022, yearModel: 2022,
      km: 38000, price: 158000, fipePrice: 168000,
      transmission: "AUTOMATICO", fuel: "FLEX", color: "Cinza Grafite", plate: "BEF6A78",
      features: ["Teto Solar Panoramico", "Bancos em Couro", "Multimidia 10\"", "Pack High Tech", "LED", "Keyless"],
      photos: ["https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=600&h=400&fit=crop"],
      status: "PUBLISHED", capturedDaysAgo: 12, approvedDaysAgo: 11, publishedDaysAgo: 10,
    },
    {
      model: "Creta Platinum 1.0 Turbo", brand: "HYUNDAI", year: 2022, yearModel: 2023,
      km: 30000, price: 132000, fipePrice: 140000,
      transmission: "AUTOMATICO", fuel: "FLEX", color: "Prata", plate: "SBD7C12",
      features: ["Teto Solar", "Couro", "Camera 360", "Bluelink", "Carregador Wireless", "LED"],
      photos: ["https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=600&h=400&fit=crop"],
      status: "PUBLISHED", capturedDaysAgo: 9, approvedDaysAgo: 8, publishedDaysAgo: 7,
    },
    {
      model: "Corolla Cross XRX Hybrid", brand: "TOYOTA", year: 2023, yearModel: 2024,
      km: 12000, price: 195000, fipePrice: 210000,
      transmission: "CVT", fuel: "HIBRIDO", color: "Branco Perola", plate: "TBE8D34",
      features: ["Toyota Safety Sense", "Teto Solar", "Couro", "JBL Premium", "LED Projetor", "Keyless"],
      photos: ["https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=600&h=400&fit=crop"],
      status: "PUBLISHED", capturedDaysAgo: 4, approvedDaysAgo: 3, publishedDaysAgo: 2,
    },

    // APPROVED (5 vehicles)
    {
      model: "Polo Track 1.0 MPI", brand: "VOLKSWAGEN", year: 2024, yearModel: 2024,
      km: 8000, price: 78000, fipePrice: 82000,
      transmission: "MANUAL", fuel: "FLEX", color: "Branco", plate: "RJK1A23",
      features: ["Ar Condicionado", "Direcao Eletrica", "Vidros Eletricos", "Alarme"],
      photos: ["https://images.unsplash.com/photo-1590362891991-f776e747a588?w=600&h=400&fit=crop"],
      status: "APPROVED", capturedDaysAgo: 2, approvedDaysAgo: 1,
    },
    {
      model: "Onix LTZ 1.0 Turbo", brand: "CHEVROLET", year: 2023, yearModel: 2024,
      km: 18000, price: 88000, fipePrice: 93000,
      transmission: "AUTOMATICO", fuel: "FLEX", color: "Vermelho", plate: "QBC4E56",
      features: ["Multimidia 8\"", "Carplay/Android Auto", "Camera de Re", "Sensor de Chuva"],
      photos: ["https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=600&h=400&fit=crop"],
      status: "APPROVED", capturedDaysAgo: 2, approvedDaysAgo: 1,
    },
    {
      model: "Kicks Exclusive 1.6 e-POWER", brand: "NISSAN", year: 2024, yearModel: 2024,
      km: 5000, price: 148000, fipePrice: 156000,
      transmission: "AUTOMATICO", fuel: "HIBRIDO", color: "Preto", plate: "TDE9F01",
      features: ["e-POWER", "ProPilot", "Teto Solar", "Couro", "Bose Audio", "Around View"],
      photos: ["https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=600&h=400&fit=crop"],
      status: "APPROVED", capturedDaysAgo: 1, approvedDaysAgo: 0,
    },
    {
      model: "Renegade Longitude 1.3 T270", brand: "JEEP", year: 2022, yearModel: 2023,
      km: 45000, price: 118000, fipePrice: 125000,
      transmission: "AUTOMATICO", fuel: "FLEX", color: "Verde", plate: "BDF5G78",
      features: ["Multimidia 8.4\"", "Couro", "Keyless", "Camera de Re", "Farol de Neblina"],
      photos: ["https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&h=400&fit=crop"],
      status: "APPROVED", capturedDaysAgo: 3, approvedDaysAgo: 1,
    },
    {
      model: "Taos Comfortline 1.4 TSI", brand: "VOLKSWAGEN", year: 2023, yearModel: 2023,
      km: 25000, price: 162000, fipePrice: 172000,
      transmission: "AUTOMATICO", fuel: "FLEX", color: "Cinza Platinum", plate: "MTE6H90",
      features: ["DCC", "Multimidia 10\"", "Digital Cockpit", "Camera de Re", "LED", "6 Airbags"],
      photos: ["https://images.unsplash.com/photo-1542362567-b07e54358753?w=600&h=400&fit=crop"],
      status: "APPROVED", capturedDaysAgo: 2, approvedDaysAgo: 0,
    },

    // PENDING (6 vehicles)
    {
      model: "HB20 Platinum 1.0 Turbo", brand: "HYUNDAI", year: 2024, yearModel: 2024,
      km: 3000, price: 98000, fipePrice: 103000,
      transmission: "AUTOMATICO", fuel: "FLEX", color: "Azul", plate: null,
      features: ["Couro", "Multimidia 8\"", "Carplay", "Camera de Re", "Alerta de Colisao"],
      photos: ["https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=600&h=400&fit=crop"],
      status: "PENDING", capturedDaysAgo: 0,
    },
    {
      model: "Pulse Impetus 1.0 Turbo", brand: "FIAT", year: 2023, yearModel: 2024,
      km: 20000, price: 95000, fipePrice: 100000,
      transmission: "CVT", fuel: "FLEX", color: "Vermelho Amore", plate: "RBC3D45",
      features: ["Tela 10.1\"", "Wireless Carplay", "Camera de Re", "Keyless", "LED"],
      photos: ["https://images.unsplash.com/photo-1616422285623-13ff0162193c?w=600&h=400&fit=crop"],
      status: "PENDING", capturedDaysAgo: 0,
    },
    {
      model: "Fastback Limited 1.3 Turbo", brand: "FIAT", year: 2023, yearModel: 2024,
      km: 16000, price: 118000, fipePrice: 126000,
      transmission: "AUTOMATICO", fuel: "FLEX", color: "Preto", plate: "SCE7F89",
      features: ["Teto Solar", "Couro", "ADAS", "Multimidia 10.1\"", "Wireless Carplay", "LED"],
      photos: ["https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=600&h=400&fit=crop"],
      status: "PENDING", capturedDaysAgo: 0,
    },
    {
      model: "Tucson GLS 1.6 Turbo", brand: "HYUNDAI", year: 2023, yearModel: 2023,
      km: 27000, price: 192000, fipePrice: 205000,
      transmission: "AUTOMATICO", fuel: "FLEX", color: "Branco", plate: "TBF2G34",
      features: ["Teto Solar Panoramico", "Couro", "Bluelink", "ADAS Nivel 2", "JBL", "LED Matrix"],
      photos: ["https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=600&h=400&fit=crop"],
      status: "PENDING", capturedDaysAgo: 0,
    },
    {
      model: "Argo Trekking 1.3", brand: "FIAT", year: 2023, yearModel: 2023,
      km: 32000, price: 72000, fipePrice: 76000,
      transmission: "MANUAL", fuel: "FLEX", color: "Laranja", plate: "QAE5H67",
      features: ["Multimidia 7\"", "Carplay", "Ar Condicionado", "Direcao Eletrica"],
      photos: ["https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=600&h=400&fit=crop"],
      status: "PENDING", capturedDaysAgo: 1,
    },
    {
      model: "Nivus Highline 1.0 TSI", brand: "VOLKSWAGEN", year: 2022, yearModel: 2023,
      km: 40000, price: 105000, fipePrice: 112000,
      transmission: "AUTOMATICO", fuel: "FLEX", color: "Prata", plate: "BEG8A12",
      features: ["Teto Solar", "Multimidia 10\"", "Digital Cockpit", "Camera de Re", "LED"],
      photos: ["https://images.unsplash.com/photo-1502877338535-766e1452684a?w=600&h=400&fit=crop"],
      status: "PENDING", capturedDaysAgo: 0,
    },

    // PENDING extras
    {
      model: "Sentra Advance 2.0", brand: "NISSAN", year: 2023, yearModel: 2023,
      km: 19000, price: 128000, fipePrice: 135000,
      transmission: "CVT", fuel: "FLEX", color: "Cinza Grafite", plate: null,
      features: ["Zero Gravity Seats", "Multimidia 8\"", "ProPilot Assist", "Camera 360", "LED"],
      photos: ["https://images.unsplash.com/photo-1553440569-bcc63803a83d?w=600&h=400&fit=crop"],
      status: "PENDING", capturedDaysAgo: 0,
    },
    {
      model: "Cronos Drive 1.3", brand: "FIAT", year: 2023, yearModel: 2024,
      km: 25000, price: 72000, fipePrice: 76000,
      transmission: "MANUAL", fuel: "FLEX", color: "Branco", plate: "QRT5B67",
      features: ["Multimidia 7\"", "Carplay", "Ar Condicionado", "Alarme"],
      photos: ["https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=600&h=400&fit=crop"],
      status: "PENDING", capturedDaysAgo: 0,
    },
    {
      model: "Virtus Comfortline 1.0 TSI", brand: "VOLKSWAGEN", year: 2023, yearModel: 2024,
      km: 22000, price: 105000, fipePrice: 112000,
      transmission: "AUTOMATICO", fuel: "FLEX", color: "Preto Ninja", plate: "TGH8C90",
      features: ["Digital Cockpit", "Multimidia 10\"", "Carplay Wireless", "Camera de Re", "6 Airbags"],
      photos: ["https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?w=600&h=400&fit=crop"],
      status: "PENDING", capturedDaysAgo: 0,
    },
    {
      model: "Compass S 1.3 T270", brand: "JEEP", year: 2024, yearModel: 2025,
      km: 3000, price: 185000, fipePrice: 198000,
      transmission: "AUTOMATICO", fuel: "FLEX", color: "Preto Vulcano", plate: null,
      features: ["Teto Solar", "Couro", "Pack Technology", "Multimidia 10.1\"", "LED", "4x2"],
      photos: ["https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?w=600&h=400&fit=crop"],
      status: "PENDING", capturedDaysAgo: 0,
    },
    {
      model: "Creta Ultimate 1.0 Turbo", brand: "HYUNDAI", year: 2024, yearModel: 2025,
      km: 1500, price: 155000, fipePrice: 165000,
      transmission: "AUTOMATICO", fuel: "FLEX", color: "Verde Amazonas", plate: null,
      features: ["Teto Solar Panoramico", "Couro", "Bluelink", "ADAS Nivel 2", "Carregador Wireless", "JBL"],
      photos: ["https://images.unsplash.com/photo-1526726538690-5cbf956ae2fd?w=600&h=400&fit=crop"],
      status: "PENDING", capturedDaysAgo: 0,
    },
    {
      model: "Corolla Altis Hybrid", brand: "TOYOTA", year: 2023, yearModel: 2024,
      km: 18000, price: 172000, fipePrice: 185000,
      transmission: "CVT", fuel: "HIBRIDO", color: "Prata", plate: "UBF3D45",
      features: ["Toyota Safety Sense", "Couro", "JBL Premium", "Wireless Carplay", "LED Projetor"],
      photos: ["https://images.unsplash.com/photo-1550355291-bbee04a92027?w=600&h=400&fit=crop"],
      status: "PENDING", capturedDaysAgo: 0,
    },

    // APPROVED extras
    {
      model: "Tracker LTZ 1.0 Turbo", brand: "CHEVROLET", year: 2024, yearModel: 2024,
      km: 9000, price: 132000, fipePrice: 140000,
      transmission: "AUTOMATICO", fuel: "FLEX", color: "Azul Seeker", plate: "VCD6E78",
      features: ["Wi-Fi", "Camera 360", "Piloto Automatico", "Teto Solar", "Couro", "OnStar"],
      photos: ["https://images.unsplash.com/photo-1580274455191-1c62238ce452?w=600&h=400&fit=crop"],
      status: "APPROVED", capturedDaysAgo: 2, approvedDaysAgo: 1,
    },
    {
      model: "SW4 SRX 2.8 Diesel", brand: "TOYOTA", year: 2022, yearModel: 2023,
      km: 48000, price: 295000, fipePrice: 315000,
      transmission: "AUTOMATICO", fuel: "DIESEL", color: "Branco Perola", plate: "WDE7F90",
      features: ["7 Lugares", "Couro", "Teto Solar", "Toyota Safety Sense", "Multimidia 9\"", "4x4"],
      photos: ["https://images.unsplash.com/photo-1612825173281-9a193378527e?w=600&h=400&fit=crop"],
      status: "APPROVED", capturedDaysAgo: 1, approvedDaysAgo: 0,
    },
    {
      model: "HR-V Advance 1.5 DI", brand: "HONDA", year: 2024, yearModel: 2024,
      km: 6000, price: 168000, fipePrice: 178000,
      transmission: "CVT", fuel: "FLEX", color: "Cinza Lunar", plate: "XEF8G12",
      features: ["Honda Sensing", "Teto Solar", "Couro", "Carplay/Android Auto", "LED", "Ar Digital"],
      photos: ["https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=600&h=400&fit=crop"],
      status: "APPROVED", capturedDaysAgo: 1, approvedDaysAgo: 0,
    },

    // PUBLISHED extras
    {
      model: "Tiggo 7 Pro 1.5 Turbo", brand: "CAOA CHERY", year: 2023, yearModel: 2024,
      km: 20000, price: 138000, fipePrice: 148000,
      transmission: "CVT", fuel: "FLEX", color: "Preto", plate: "YFG9H34",
      features: ["Teto Solar Panoramico", "Couro", "Camera 360", "ADAS", "Carplay", "LED"],
      photos: ["https://images.unsplash.com/photo-1616455579100-2ceaa4eb2d37?w=600&h=400&fit=crop"],
      status: "PUBLISHED", capturedDaysAgo: 8, approvedDaysAgo: 7, publishedDaysAgo: 6,
    },
    {
      model: "Corolla GR-S 2.0 Hybrid", brand: "TOYOTA", year: 2024, yearModel: 2024,
      km: 5000, price: 195000, fipePrice: 210000,
      transmission: "CVT", fuel: "HIBRIDO", color: "Preto Atitude", plate: "ZGH1A56",
      features: ["GR-S Kit", "Toyota Safety Sense 3.0", "JBL 9 alto-falantes", "Couro", "LED Projetor", "Bi-Tone"],
      photos: ["https://images.unsplash.com/photo-1494905998402-395d579af36f?w=600&h=400&fit=crop"],
      status: "PUBLISHED", capturedDaysAgo: 5, approvedDaysAgo: 4, publishedDaysAgo: 3,
    },
    {
      model: "Yaris Cross XLS 1.5", brand: "TOYOTA", year: 2024, yearModel: 2025,
      km: 4000, price: 135000, fipePrice: 142000,
      transmission: "CVT", fuel: "FLEX", color: "Vermelho Granada", plate: "AHI2B78",
      features: ["Toyota Safety Sense", "Multimidia 9\"", "Camera de Re", "LED", "Controle de Cruzeiro"],
      photos: ["https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?w=600&h=400&fit=crop"],
      status: "PUBLISHED", capturedDaysAgo: 6, approvedDaysAgo: 5, publishedDaysAgo: 4,
    },
    {
      model: "Ranger Limited 3.0 V6", brand: "FORD", year: 2024, yearModel: 2025,
      km: 12000, price: 298000, fipePrice: 320000,
      transmission: "AUTOMATICO", fuel: "DIESEL", color: "Azul Lightning", plate: "BIJ3C90",
      features: ["Bi-Turbo V6", "Couro", "SYNC 4", "Camera 360", "Assistente de Reboque", "4x4"],
      photos: ["https://images.unsplash.com/photo-1544829099-b9a0c07fad1a?w=600&h=400&fit=crop"],
      status: "PUBLISHED", capturedDaysAgo: 7, approvedDaysAgo: 6, publishedDaysAgo: 5,
    },
    {
      model: "Polo Highline 1.0 TSI", brand: "VOLKSWAGEN", year: 2023, yearModel: 2024,
      km: 15000, price: 98000, fipePrice: 104000,
      transmission: "AUTOMATICO", fuel: "FLEX", color: "Cinza Platinum", plate: "CJK4D12",
      features: ["Multimidia 10\"", "Digital Cockpit", "LED", "Ar Digital", "Sensor de Estacionamento"],
      photos: ["https://images.unsplash.com/photo-1511919884226-fd3cad34687c?w=600&h=400&fit=crop"],
      status: "PUBLISHED", capturedDaysAgo: 10, approvedDaysAgo: 9, publishedDaysAgo: 8,
    },

    // REJECTED extras
    {
      model: "Gol 1.0 MPI", brand: "VOLKSWAGEN", year: 2018, yearModel: 2019,
      km: 95000, price: 42000, fipePrice: 44000,
      transmission: "MANUAL", fuel: "FLEX", color: "Prata", plate: "AZX1234",
      features: ["Ar Condicionado", "Direcao Hidraulica"],
      photos: ["https://images.unsplash.com/photo-1471479917193-f00955256257?w=600&h=400&fit=crop"],
      status: "REJECTED", capturedDaysAgo: 3, rejectionReason: "Veiculo muito antigo para o perfil dos grupos",
    },
    {
      model: "Mobi Like 1.0", brand: "FIAT", year: 2019, yearModel: 2020,
      km: 78000, price: 38000, fipePrice: 40000,
      transmission: "MANUAL", fuel: "FLEX", color: "Branco", plate: "BCD5678",
      features: ["Ar Condicionado", "Direcao Eletrica"],
      photos: ["https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=600&h=400&fit=crop"],
      status: "REJECTED", capturedDaysAgo: 5, rejectionReason: "Valor abaixo do minimo para repasse",
    },
    {
      model: "Ka SE 1.0", brand: "FORD", year: 2020, yearModel: 2020,
      km: 65000, price: 45000, fipePrice: 48000,
      transmission: "MANUAL", fuel: "FLEX", color: "Cinza", plate: "RCE9012",
      features: ["Multimidia", "Camera de Re", "Ar Condicionado"],
      photos: ["https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=600&h=400&fit=crop"],
      status: "REJECTED", capturedDaysAgo: 4, rejectionReason: "Fotos insuficientes para anuncio",
    },
    {
      model: "Kwid Zen 1.0", brand: "RENAULT", year: 2021, yearModel: 2022,
      km: 52000, price: 48000, fipePrice: 51000,
      transmission: "MANUAL", fuel: "FLEX", color: "Vermelho", plate: "DKL5E34",
      features: ["Multimidia 8\"", "Camera de Re"],
      photos: ["https://images.unsplash.com/photo-1504215680853-026ed2a45def?w=600&h=400&fit=crop"],
      status: "REJECTED", capturedDaysAgo: 6, rejectionReason: "Modelo com baixa demanda no mercado",
    },
    {
      model: "Logan Life 1.0", brand: "RENAULT", year: 2020, yearModel: 2021,
      km: 72000, price: 52000, fipePrice: 55000,
      transmission: "MANUAL", fuel: "FLEX", color: "Prata", plate: "ELM6F56",
      features: ["Ar Condicionado", "Direcao Eletrica", "Vidros Eletricos"],
      photos: ["https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=600&h=400&fit=crop"],
      status: "REJECTED", capturedDaysAgo: 8, rejectionReason: "Preco fora da margem de repasse",
    },
  ];

  const createdVehicles: Array<{
    id: string; model: string; vehicleHash: string; status: string;
    price: number; features: string; year: number; yearModel?: number;
    km: number; fipePrice?: number; transmission?: string; fuel?: string;
    publishedDaysAgo?: number;
  }> = [];

  for (let vi = 0; vi < vehiclesData.length; vi++) {
    const v = vehiclesData[vi];
    const vehicleHash = hash(v.model, v.year, v.km, v.price);
    const sellingPrice = v.status !== "PENDING" && v.status !== "REJECTED"
      ? v.price * (1 + margin / 100)
      : null;

    const formattedAd = (v.status === "APPROVED" || v.status === "PUBLISHED")
      ? formatAd({
          model: v.model, year: v.year, yearModel: v.yearModel, km: v.km,
          price: v.price, fipePrice: v.fipePrice, transmission: v.transmission,
          fuel: v.fuel, features: v.features, margin,
        })
      : null;

    const vehicle = await prisma.vehicle.create({
      data: {
        model: v.model,
        brand: v.brand,
        year: v.year,
        yearModel: v.yearModel,
        km: v.km,
        price: v.price,
        sellingPrice,
        fipePrice: v.fipePrice,
        transmission: v.transmission,
        fuel: v.fuel,
        color: v.color,
        plate: v.plate,
        features: JSON.stringify(v.features),
        photos: JSON.stringify((v as Record<string, unknown>).photos || []),
        rawDescription: rawWhatsApp(v as Parameters<typeof rawWhatsApp>[0], vi),
        sourceGroupId: sourceGroups[Math.floor(Math.random() * 3)].groupId,
        sourceMessageId: `MSG${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
        sellerPhone: `41${9}${String(Math.floor(Math.random() * 90000000 + 10000000))}`,
        vehicleHash,
        status: v.status,
        formattedAd,
        rejectionReason: (v as Record<string, unknown>).rejectionReason as string | undefined,
        capturedAt: daysAgo(v.capturedDaysAgo),
        approvedAt: (v as Record<string, unknown>).approvedDaysAgo != null
          ? daysAgo((v as Record<string, unknown>).approvedDaysAgo as number)
          : null,
        publishedAt: (v as Record<string, unknown>).publishedDaysAgo != null
          ? daysAgo((v as Record<string, unknown>).publishedDaysAgo as number)
          : null,
      },
    });

    createdVehicles.push({
      id: vehicle.id,
      model: v.model,
      vehicleHash,
      status: v.status,
      price: v.price,
      features: JSON.stringify(v.features),
      year: v.year,
      yearModel: v.yearModel,
      km: v.km,
      fipePrice: v.fipePrice,
      transmission: v.transmission,
      fuel: v.fuel,
      publishedDaysAgo: (v as Record<string, unknown>).publishedDaysAgo as number | undefined,
    });
  }

  const counts = { PENDING: 0, APPROVED: 0, PUBLISHED: 0, REJECTED: 0 };
  for (const v of createdVehicles) counts[v.status as keyof typeof counts]++;
  console.log("Vehicles:", JSON.stringify(counts));

  // ---- Post History (for PUBLISHED vehicles) ----
  let postCount = 0;
  for (const v of createdVehicles.filter((x) => x.status === "PUBLISHED")) {
    const numGroups = 2 + Math.floor(Math.random() * 2);
    const shuffled = [...targetGroups].sort(() => Math.random() - 0.5);
    const groups = shuffled.slice(0, numGroups);

    for (const g of groups) {
      const success = Math.random() > 0.08;
      await prisma.postHistory.create({
        data: {
          vehicleId: v.id,
          vehicleHash: v.vehicleHash,
          targetGroupId: g.groupId,
          postedAt: daysAgo(v.publishedDaysAgo || 1),
          messageId: success ? `3EB0${Math.random().toString(36).slice(2, 14).toUpperCase()}` : null,
          success,
          errorMessage: success ? null : "Timeout ao enviar mensagem para o grupo",
        },
      });
      postCount++;
    }
  }
  console.log("Post history records:", postCount);

  // ---- Audit Logs ----
  const auditEntries: Array<{
    action: string;
    entityType: string;
    entityId: string;
    userId: string;
    vehicleId: string;
    details: string | null;
    createdAt: Date;
  }> = [];

  for (const v of createdVehicles) {
    auditEntries.push({
      action: "VEHICLE_CAPTURED",
      entityType: "Vehicle",
      entityId: v.id,
      userId: admin.id,
      vehicleId: v.id,
      details: JSON.stringify({ model: v.model, source: "webhook" }),
      createdAt: daysAgo(10 + Math.floor(Math.random() * 5)),
    });

    if (v.status === "APPROVED" || v.status === "PUBLISHED") {
      auditEntries.push({
        action: "VEHICLE_APPROVED",
        entityType: "Vehicle",
        entityId: v.id,
        userId: admin.id,
        vehicleId: v.id,
        details: JSON.stringify({ model: v.model, sellingPrice: v.price * 1.1 }),
        createdAt: daysAgo(5 + Math.floor(Math.random() * 3)),
      });
    }

    if (v.status === "PUBLISHED") {
      auditEntries.push({
        action: "VEHICLE_PUBLISHED",
        entityType: "Vehicle",
        entityId: v.id,
        userId: admin.id,
        vehicleId: v.id,
        details: JSON.stringify({ model: v.model, groupsPublished: 2 + Math.floor(Math.random() * 2) }),
        createdAt: daysAgo(v.publishedDaysAgo || 1),
      });
    }

    if (v.status === "REJECTED") {
      auditEntries.push({
        action: "VEHICLE_REJECTED",
        entityType: "Vehicle",
        entityId: v.id,
        userId: admin.id,
        vehicleId: v.id,
        details: JSON.stringify({ model: v.model }),
        createdAt: daysAgo(3 + Math.floor(Math.random() * 2)),
      });
    }
  }

  for (const a of auditEntries) {
    await prisma.auditLog.create({ data: a });
  }
  console.log("Audit logs:", auditEntries.length);

  console.log("\nDemo seed completed!");
  console.log("Login: admin@cugini.com.br / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
