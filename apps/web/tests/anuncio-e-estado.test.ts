#!/usr/bin/env tsx
/**
 * Trava do padrao de anuncio pedido pelo cliente (set/2026) e da leitura de
 * estado e cambio.
 *
 * Os textos abaixo sao os anuncios reais que o cliente mandou como exemplo de
 * erro: o A45 com "450HP" lido como km e "Sem manual" lido como cambio, o
 * e-tron com titulo em maiusculas, com marca e "(manual)", e o GWM do
 * Nordeste entregue como SC.
 *
 * Uso: pnpm --filter web exec tsx tests/anuncio-e-estado.test.ts
 */
import assert from "node:assert/strict";
import { extractWithRegex } from "../src/lib/ai/regex";
import { cambioConfirmado, detectarCambio } from "../src/lib/ai/cambio";
import { conferirComOVendedor, lerItens, soOQueEstaNoTexto } from "../src/lib/ad-cleaner";
import { detectarEstado, estadoAtendido, normalizarEstado } from "../src/lib/estados";
import {
  anuncioParaExibir,
  formatVehicleAd,
  garantirPrecoDeVenda,
  lerPrecoDeVenda,
  tituloDoAnuncio,
  trocarPrecoDeVenda,
} from "../src/lib/vehicle-formatter";

const ATENDIDOS = ["RS", "SC", "PR", "SP"];
let falhas = 0;
function caso(nome: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`FALHOU ${nome}\n       ${(e as Error).message.split("\n").join("\n       ")}`);
  }
}

// ── Anuncios reais do cliente ─────────────────────────────────────────────
const A45 = `A45 AMG 2.0T 4MATIC

Ano 2014

84.000 Km

450HP
TETO SOLAR
Tração 4X4
Launch Control
STAGE 2
Rodas 19

✅ IPVA 26 PAGO
Sem manual + Sem chave cópia

Fipe: 154.220
Por: 126.990`;

const ETRON = `AUDI E-TRON SPORTBACK PERFORMANCE BLACK
2022 | 55.000km

Pneus bons
Manual e chave cópia
Teto solar
Painel TFT
IPVA 26 pago

Fipe: 294.000,00
Por: 204.990,00`;

const GWM = `GWM HAVAL H6 GT
2024
47.000km

IPVA PAGO
MANUAL + CHAVE CÓPIA
CARRO BOM

FIPE R$ 212.149,00
*R$ 190.000,00*

📍 Nordeste`;

console.log("Anuncios reais do cliente");
caso("A45: km vem de '84.000 Km', nao de '450HP'", () => {
  const v = extractWithRegex(A45);
  assert.equal(v?.km, 84000);
  assert.equal(v?.year, 2014);
});
caso("A45: 'Sem manual + Sem chave cópia' nao e cambio", () => {
  assert.equal(extractWithRegex(A45)?.transmission, undefined);
});
caso("e-tron: eletrico e automatico, 'Manual e chave cópia' e item", () => {
  const v = extractWithRegex(ETRON);
  assert.equal(v?.transmission, "AUTOMATICO");
  assert.equal(v?.fuel, "ELETRICO");
});
caso("e-tron: anuncio sai exatamente no padrao do cliente", () => {
  const v = extractWithRegex(ETRON)!;
  const anuncio = formatVehicleAd(
    { ...v, price: 204990, fipePrice: 294000, rawDescription: ETRON },
    { profitMarginPercent: 0 }
  );
  assert.equal(anuncio, [
    "*E-Tron Sportback Performance Black (aut.)*",
    "2022 | 55.000km",
    "",
    "Teto solar",
    "Painel TFT",
    "Pneus bons",
    "IPVA 26 pago",
    "Manual e chave reserva",
    "",
    "Fipe: 294.000,00",
    "Por: *204.990,00*",
  ].join("\n"));
});
caso("GWM: '📍 Nordeste' vira NORDESTE, nao atendido", () => {
  const v = extractWithRegex(GWM);
  assert.equal(v?.state, "NORDESTE");
  assert.equal(estadoAtendido(v!.state!, ATENDIDOS), false);
});
caso("GWM: titulo sem a marca repetida e sem 'manual'", () => {
  const v = extractWithRegex(GWM)!;
  assert.equal(v.transmission, undefined);
  assert.equal(tituloDoAnuncio(v), "Haval H6 GT");
  assert.equal(tituloDoAnuncio({ ...v, transmission: "AUTOMATICO" }), "Haval H6 GT (aut.)");
});

// ── Titulo ────────────────────────────────────────────────────────────────
console.log("Titulo no padrao");
const TITULOS: [Parameters<typeof tituloDoAnuncio>[0], string][] = [
  [{ model: "COROLLA GLI 2.0 AUT", brand: "TOYOTA", transmission: "AUTOMATICO" }, "Corolla GLI 2.0 (aut.)"],
  [{ model: "C180 AVANTGARDE 1.6 TURBO", brand: "MERCEDES", transmission: "AUTOMATICO" }, "C180 Avantgarde 1.6T (aut.)"],
  [{ model: "Compass Longitude flex T270 2023", brand: "JEEP", transmission: "AUTOMATICO" }, "Compass Longitude T270 (aut.)"],
  [{ model: "A45 AMG 2.0T 4MATIC", brand: null, transmission: null }, "A45 AMG 2.0T 4MATIC"],
  [{ model: "ONIX LT 1.0 TURBO MANUAL", brand: "CHEVROLET", transmission: "MANUAL" }, "Onix LT 1.0T (manual)"],
  [{ model: "VW T-CROSS HIGHLINE 250 TSI", brand: "VOLKSWAGEN", transmission: "AUTOMATICO" }, "T-Cross Highline 250 TSI (aut.)"],
  [{ model: "COROLLA CROSS XRX HYBRID", brand: "TOYOTA", fuel: "HIBRIDO", transmission: "CVT" }, "Corolla Cross XRX (híbrido)"],
  [{ model: "BMW i7", brand: "BMW", transmission: "AUTOMATICO" }, "i7 (aut.)"],
  [{ model: "JEEP", brand: "JEEP", transmission: null }, "Jeep"],
  [{ model: "MERCEDES-BENZ GLA 200 1.3 TB 2021/2022", brand: "MERCEDES", transmission: "AUTOMATICO" }, "GLA 200 1.3T (aut.)"],
  // Sigla sempre inteira em maiusculas, palavra comum so com a inicial.
  [{ model: "TOYOTA HILUX CD SRV 2.7 4X4 FLEX", brand: "TOYOTA", transmission: "AUTOMATICO" }, "Hilux CD SRV 2.7 4X4 (aut.)"],
  [{ model: "HILUX CE", brand: "TOYOTA", transmission: "MANUAL" }, "Hilux CE (manual)"],
  [{ model: "COROLLA XLI 1.8", brand: "TOYOTA", transmission: "AUTOMATICO" }, "Corolla XLI 1.8 (aut.)"],
  [{ model: "PALIO ELX 1.0", brand: "FIAT", transmission: "MANUAL" }, "Palio ELX 1.0 (manual)"],
  [{ model: "HB20 1.0 TGDI PLATINUM", brand: "HYUNDAI", transmission: "AUTOMATICO" }, "HB20 1.0 TGDI Platinum (aut.)"],
  [{ model: "KWID ZEN 1.0 SCE", brand: "RENAULT", transmission: "MANUAL" }, "Kwid Zen 1.0 SCE (manual)"],
  [{ model: "MOBI LIKE 1.0 MT", brand: "FIAT", transmission: "MANUAL" }, "Mobi Like 1.0 (manual)"],
  [{ model: "BMW 320I M SPORT", brand: "BMW", transmission: "AUTOMATICO" }, "320i M Sport (aut.)"],
  [{ model: "X1 SDRIVE20I GP", brand: "BMW", transmission: "AUTOMATICO" }, "X1 sDrive20i GP (aut.)"],
  [{ model: "SONG PLUS DM-I", brand: "BYD", fuel: "HIBRIDO", transmission: "AUTOMATICO" }, "Song Plus DM-i (híbrido)"],
  [{ model: "RAM 2500 LARAMIE 6.7", brand: "RAM", transmission: "AUTOMATICO" }, "RAM 2500 Laramie 6.7 (aut.)"],
];
for (const [entrada, esperado] of TITULOS) {
  caso(`${entrada.model} -> ${esperado}`, () => assert.equal(tituloDoAnuncio(entrada), esperado));
}

// ── Cambio ────────────────────────────────────────────────────────────────
console.log("Cambio");
const CAMBIOS: [string, string | undefined][] = [
  ["Manual e chave cópia", undefined],
  ["Sem manual + Sem chave cópia", undefined],
  ["Acompanha manual do proprietário e chave reserva", undefined],
  ["Chave reserva e manual", undefined],
  ["Ar digital automático\nManual e chave", undefined],
  ["Câmbio manual", "MANUAL"],
  ["Onix 1.0 manual\nIPVA pago", "MANUAL"],
  ["COROLLA GLI 2.0 AUT", "AUTOMATICO"],
  ["Automático, manual e chave reserva", "AUTOMATICO"],
  ["HRV EXL CVT", "CVT"],
  ["Onix 1.0 AT turbo", "AUTOMATICO"],
  ["Trava elétrica, direção elétrica", undefined],
  ["AUDI E-TRON SPORTBACK", "AUTOMATICO"],
];
for (const [texto, esperado] of CAMBIOS) {
  caso(`${JSON.stringify(texto)} -> ${esperado ?? "sem cambio"}`, () =>
    assert.equal(detectarCambio(texto), esperado)
  );
}

// ── Estado ────────────────────────────────────────────────────────────────
console.log("Estado");
const ESTADOS: [string, string | undefined][] = [
  ["Carro em Vitória - ES\nEntrego em SC", "ES"],
  ["📍 Porto Alegre", "RS"],
  ["Curitiba/PR", "PR"],
  ["ENTREGO EM SC", "SC"],
  ["Rio Grande do Norte", "RN"],
  ["Localização: Salvador", "BA"],
  ["Carro no Nordeste", "NORDESTE"],
  ["📍 Sul", "SUL"],
  ["AUDI RS 3 SPORTBACK", undefined],
  ["Ar AC digital", undefined],
  ["SE INTERESSAR CHAMA", undefined],
  ["Estado: impecável", undefined],
  ["IPVA PAGO\nPNEUS BONS", undefined],
  ["rs muito bom kkk", undefined],
];
for (const [texto, esperado] of ESTADOS) {
  caso(`${JSON.stringify(texto)} -> ${esperado ?? "sem estado"}`, () =>
    assert.equal(detectarEstado(texto).state, esperado)
  );
}
caso("normalizar: 'Espírito Santo' -> ES, 'sc' -> SC, 'centro oeste' -> CENTRO-OESTE", () => {
  assert.equal(normalizarEstado("Espírito Santo"), "ES");
  assert.equal(normalizarEstado("sc"), "SC");
  assert.equal(normalizarEstado("centro oeste"), "CENTRO-OESTE");
  assert.equal(normalizarEstado("qualquer coisa"), null);
});
caso("atendido: Sul sim, Sudeste nao (pode ser RJ), ES nao", () => {
  assert.equal(estadoAtendido("SUL", ATENDIDOS), true);
  assert.equal(estadoAtendido("SUDESTE", ATENDIDOS), false);
  assert.equal(estadoAtendido("ES", ATENDIDOS), false);
});

// ── Texto do operador ─────────────────────────────────────────────────────
console.log("Texto do operador");
const ANTIGO = "*AUDI E-TRON SPORTBACK (manual)*\n2022 | 55.000km\n\nPneus bons\n\nPor: *204.990,00*";
const dados = { model: "AUDI E-TRON SPORTBACK", brand: "AUDI", transmission: "AUTOMATICO", fuel: "ELETRICO" };
caso("anuncio gerado ganha o titulo novo", () => {
  assert.equal(
    anuncioParaExibir({ ...dados, formattedAd: ANTIGO })?.split("\n")[0],
    "*E-Tron Sportback (aut.)*"
  );
});
caso("anuncio editado pelo operador fica como esta", () => {
  assert.equal(anuncioParaExibir({ ...dados, formattedAd: ANTIGO, adEditedAt: "2026-09-16" }), ANTIGO);
});
caso("texto do sistema: so a linha 'Por:' acompanha o preco", () => {
  assert.equal(
    trocarPrecoDeVenda(ANTIGO, 214990),
    ANTIGO.replace("Por: *204.990,00*", "Por: *214.990,00*")
  );
});

// O cliente poe a margem dele digitando na linha "Por:" -- esse e o preco.
const PRECOS: [string, number | null][] = [
  ["Por: *129.800,00*", 129800],
  ["Fipe: 139.900,00\nPor: *139.900*", 139900],
  ["Por 186.000", 186000],
  ["POR: R$ 129.900", 129900],
  ["Por: R$ *1.290.000,00*", 1290000],
  ["Por: 129 mil", 129000],
  ["Por: 129,9 mil", 129900],
  ["Por dentro, impecável\nPor: *95.800,00*", 95800],
  ["Por 2 anos de garantia", null],
  ["Porto Alegre 150.000", null],
  ["Fipe: 139.900,00", null],
];
for (const [texto, esperado] of PRECOS) {
  caso(`preco de venda em ${JSON.stringify(texto)} -> ${esperado}`, () => assert.equal(lerPrecoDeVenda(texto), esperado));
}
caso("texto do operador com 'Por:' vai como esta", () => {
  const texto = "*Hilux CD SRV (aut.)*\n2015 | 137.000km\n\nPor: *109.900,00*";
  assert.equal(garantirPrecoDeVenda(texto, 95800), texto);
});
caso("texto do operador sem 'Por:' ganha a do sistema", () => {
  assert.equal(garantirPrecoDeVenda("*Hilux*\n2015", 95800), "*Hilux*\n2015\nPor: *95.800,00*");
});

// ── Fornecedor que escreve antes do anuncio ───────────────────────────────
// O cabecalho da loja virava o titulo: "Esse Veiculo Esta Em (aut.)".
const SPIN = `📍 ESSE VEÍCULO ESTÁ EM
(Balneário Camboriú - SC), agendar visita ou enviamos o veículo pra você após o pagamento.

🚗 SPIN PREMIER 1.8

⏳ Ano: 2025
🚘 Km: 46 mil
⛽ Combustível: FLEX
🚻 Cambio: AUTOMÁTICA
📄 IPVA 2026: PAGO

Ar condicionado gelando
Pneus bons

FIPE: R$ 119.400
R$ 94.990`;

console.log("Fornecedor com cabecalho");
caso("o carro e a linha do carro, nao a frase da loja", () => {
  const v = extractWithRegex(SPIN)!;
  assert.equal(v.model, "SPIN PREMIER 1.8");
  assert.equal(v.km, 46000); // "Km: 46 mil"
  assert.equal(tituloDoAnuncio(v), "Spin Premier 1.8 (aut.)");
});
caso("o cabecalho e as condicoes do fornecedor nao entram no anuncio", () => {
  const v = extractWithRegex(SPIN)!;
  const anuncio = formatVehicleAd({ ...v, rawDescription: SPIN }, { profitMarginPercent: 0 });
  assert.equal(anuncio, [
    "*Spin Premier 1.8 (aut.)*",
    "2025 | 46.000km",
    "",
    "Pneus bons",
    "IPVA 26 pago",
    "Ar condicionado gelando",
    "",
    "Fipe: 119.400,00",
    "Por: *94.990,00*",
  ].join("\n"));
});

// ── Hilux do cliente: marca, maiusculas, ano no titulo e "97km" ─────────
const HILUX = `TOYOTA HILUX SRX 4X4 2.8 TURBO DIESEL AUTOMÁTICA 2022/2022
97km

Ipva 2026 pago

Fipe 232.824
Por 186.000`;

console.log("Hilux do cliente");
caso("Hilux: titulo sem marca, sem ano, turbo colado e cambio no fim", () => {
  const v = extractWithRegex(HILUX)!;
  assert.equal(v.transmission, "AUTOMATICO");
  assert.equal(tituloDoAnuncio(v), "Hilux SRX 4X4 2.8T Diesel (aut.)");
});

caso("'HYBRID' (como a Toyota escreve) e hibrido e vira '(híbrido)'", () => {
  const v = extractWithRegex("TOYOTA COROLLA CROSS XRX HYBRID 2023/2023\n2023 | 20.000km\n\nPor: 180.000")!;
  assert.equal(v.fuel, "HIBRIDO");
  assert.equal(tituloDoAnuncio(v), "Corolla Cross XRX (híbrido)");
});

caso("titulo longo do vendedor (61 caracteres) nao vaza para o corpo", () => {
  const texto = "MERCEDES-BENZ C180 AVANTGARDE 1.6 TURBO AUTOMÁTICO 2019/2019\n2019 | 62.000km\n\nTeto solar\n\nPor: 118.000";
  const v = extractWithRegex(texto)!;
  const anuncio = formatVehicleAd({ ...v, price: 118000, rawDescription: texto }, { profitMarginPercent: 0 });
  assert.equal(anuncio, "*C180 Avantgarde 1.6T (aut.)*\n2019 | 62.000km\n\nTeto solar\n\nPor: *118.000,00*");
});

// ── 18/09/2026: o que o cliente viu no primeiro dia de testes ────────────
const RAMPAGE = `Rampage 2.0 Laramie
2024
31.000km

Multimídia
Painel TFT
Capota elétrica retrátil
Na garantia de fábrica até 06/2027
IPVA 2026 pago
Manual e chave cópia
Placa J do RS

Fipe 182.544,00
Por 162.990,00`;

console.log("Cambio so vale escrito");
caso("Rampage: 'Manual e chave cópia' nao faz a IA publicar '(manual)'", () => {
  assert.equal(detectarCambio(RAMPAGE), undefined);
  assert.equal(cambioConfirmado("MANUAL", RAMPAGE), undefined, "MANUAL da IA cai sem 'cambio manual' no texto");
  assert.equal(cambioConfirmado("AUTOMATICO", RAMPAGE), "AUTOMATICO", "automatico pelo modelo fica");
});
caso("'cambio manual' escrito no anuncio segue valendo", () => {
  assert.equal(cambioConfirmado("MANUAL", "GOL 1.6 2015\ncambio manual"), "MANUAL");
  assert.equal(cambioConfirmado("MANUAL", "Corolla XEi\nCVT"), undefined, "texto diz CVT, a IA nao manda");
});

const ONIX = `Onix hath premier
2025
16 mil km

Fipe 95.000?00
VENDA 85.000,00`;

console.log("Corpo do anuncio so com o que o vendedor escreveu");
caso("Onix: o exemplo do prompt devolvido pela IA nao vira anuncio", () => {
  const inventado = "Único dono\nManual do proprietário\nChave reserva\nIPVA 2025 pago\nSem detalhes";
  assert.equal(soOQueEstaNoTexto(inventado, ONIX), "");
});
caso("reescrita de giria fica: a raiz da palavra esta no anuncio", () => {
  const vendedor = "Civic EXL 2019\n80 mil km\nipva 26 pg\npneus 0\nsem retoq\n1 dono\nmanual e chave copia\nrevisado na concessionaria\nPor 110.000";
  const limpo = "IPVA 2026 pago\nPneus novos\nSem retoques\nÚnico dono\nManual e chave cópia\nRevisões na concessionária";
  assert.equal(soOQueEstaNoTexto(limpo, vendedor), limpo);
});
caso("linha inventada no meio cai e as outras ficam", () => {
  const vendedor = "Compass Limited 2021\n40.000 km\nteto solar\nPor 140.000";
  assert.equal(soOQueEstaNoTexto("Teto solar\nBlindado\nÚnico dono", vendedor), "Teto solar");
});

const RAV4 = `RAV4 2.0 4X2 AUT
2018/18
110 Mil Km
Revisões até 50
Teto Solar
Pneus novos
1x Peças
Fipe R$115.000
Pedido R$97.500`;

caso("RAV4: o anuncio sai com 'Pintar uma peça' mesmo quando a IA escreveu 'substituída'", () => {
  const v = extractWithRegex(RAV4)!;
  const daIa = "Revisões até 50 mil km\nTeto solar\nPneus novos\nUma peça substituída";
  const anuncio = formatVehicleAd(
    { ...v, rawDescription: conferirComOVendedor(daIa, RAV4) },
    { profitMarginPercent: 0 }
  );
  assert.match(anuncio, /\n\nPintar 1 peça\n\nFipe/);
  assert.doesNotMatch(anuncio, /substitu/i);
});

const COMMANDER = `Commander Overland T270
2025
27.000 km
Cambio automático
Manual e chave cópia
Ipva pago

Gastos necessários:

* Polimento

Pintura Bom
Motor Bom
Suspensão Bom
Caixa Bom

Fipe 159.071
Por 136.990`;

console.log("Defeito e com a palavra do vendedor");
caso("Commander: 'Polimento' omitido pela IA volta pro anuncio", () => {
  const daIa = "Manual e chave cópia\nIPVA pago\nMotor, suspensão e caixa OK";
  assert.equal(conferirComOVendedor(daIa, COMMANDER), "Manual e chave reserva\nIPVA pago\nMotor, suspensão e caixa bons\nFazer polimento");
});
caso("'Faz 1 retoque' reescrito como 'Retoque na pintura' volta a ser retoque a fazer", () => {
  const vendedor = "Commander Overland TD380\n2025\n26.000 km\nTeto solar\nÚnico dono\nFaz 1 retoque\nFipe 222.850,00\nRepasse 199.990,00";
  const daIa = "Teto solar\nÚnico dono\nRetoque na pintura";
  const conferido = conferirComOVendedor(daIa, vendedor);
  assert.equal(conferido, "Teto solar\nÚnico dono\nRetocar 1 peça");
  const v = extractWithRegex(vendedor)!;
  const anuncio = formatVehicleAd({ ...v, rawDescription: conferido }, { profitMarginPercent: 0 });
  assert.match(anuncio, /\n\nRetocar 1 peça\n\nFipe/);
  assert.doesNotMatch(anuncio, /retoque na pintura/i);
});

console.log("'Sem detalhes' so quando o vendedor disse");
caso("'Sem detalhes' nao entra em carro que faz retoque, nem quando 'detalhes' aparece em outro sentido", () => {
  const vendedor = "Compass Limited 2021\n40.000 km\nFaz 1 retoque\nMais detalhes no privado\nPor 140.000";
  assert.equal(conferirComOVendedor("Sem detalhes\nRetoque na pintura", vendedor), "Retocar 1 peça");
});
caso("'Sem detalhes' fica quando o vendedor escreveu", () => {
  const vendedor = "Compass Limited 2021\n40.000 km\nSem detalhes\nSem retoques\nPor 140.000";
  assert.equal(conferirComOVendedor("Sem detalhes\nSem retoques", vendedor), "Sem detalhes\nSem retoques");
});

// ── Resposta com citacao: sem fonte no texto, nao entra ─────────────────
console.log("A IA cita o vendedor");
const SPORTAGE = `SPORTAGE 2021 EX
2021/2022 - 40 mil km
✅ ipva 26 pg
✅ pneus 0
*manual e chave reserva*
rev na css
Faz 1 retoque
Fipe 140 / Por 128`;

caso("entrada com fonte no texto e saida fiel entra; trecho, emoji e negrito nao atrapalham", () => {
  const raw = JSON.stringify({ itens: [
    { fonte: "ipva 26 pg", saida: "IPVA 2026 pago" },
    { fonte: "pneus 0", saida: "Pneus novos" },
    { fonte: "manual e chave reserva", saida: "Manual e chave reserva" },
    { fonte: "rev na css", saida: "Revisões na concessionária" },
    { fonte: "Faz 1 retoque", saida: "Faz 1 retoque" },
  ] });
  assert.equal(lerItens(raw, SPORTAGE)?.linhas.join("\n"), "IPVA 26 pago\nPneus novos\nManual e chave reserva\nRevisões na concessionária\nRetocar 1 peça");
});
caso("fonte que nao esta no texto cai, mesmo parecendo item de carro", () => {
  const raw = JSON.stringify({ itens: [
    { fonte: "Único dono", saida: "Único dono" },
    { fonte: "pneus 0", saida: "Pneus novos" },
  ] });
  assert.equal(lerItens(raw, SPORTAGE)?.linhas.join("\n"), "Pneus novos");
});
caso("fonte verdadeira com saida de outra coisa cai", () => {
  const raw = JSON.stringify({ itens: [{ fonte: "pneus 0", saida: "Chave reserva" }] });
  assert.deepEqual(lerItens(raw, SPORTAGE)?.linhas, []);
});
caso("Onix: nada alem do cabecalho e rodape -> corpo vazio, sem inventar", () => {
  const raw = JSON.stringify({ itens: [
    { fonte: "Onix hath premier", saida: "Único dono" },
    { fonte: "2025", saida: "IPVA 2025 pago" },
  ] });
  assert.deepEqual(lerItens(raw, ONIX)?.linhas, []);
  assert.deepEqual(lerItens(JSON.stringify({ itens: [] }), ONIX)?.linhas, []);
});
caso("resposta que nao e JSON devolve null (proximo modelo tenta)", () => {
  assert.equal(lerItens("Pneus novos\nIPVA pago", SPORTAGE), null);
  assert.equal(lerItens(JSON.stringify({ corpo: "x" }), SPORTAGE), null);
});

// ── 18/09/2026, segunda leva: Captur e HR-V ─────────────────────────────
const CAPTUR = `CAPTUR INTENSE 1.6 - 2020
Câmbio automático
Interna couro
108 mil km
Polimento
Higienização
Faz 3 peças
Fipe 72.333,00
Por 62.990,00`;

console.log("Defeito e a fazer, e vai no fim");
caso("Captur: 'Polimento recente', 'Higienização feita' e 'Motor com 3 peças trocadas' viram o que o vendedor disse", () => {
  const daIa = "Câmbio automático\nInterior em couro\nPolimento recente\nHigienização feita\nMotor com 3 peças trocadas";
  const v = extractWithRegex(CAPTUR)!;
  const anuncio = formatVehicleAd({ ...v, rawDescription: conferirComOVendedor(daIa, CAPTUR) }, { profitMarginPercent: 0 });
  assert.equal(anuncio, [
    "*Captur Intense 1.6 (aut.)*",
    "2020 | 108.000km",
    "",
    "Interior em couro",
    "",
    "Fazer higienização",
    "Fazer polimento",
    "Pintar 3 peças",
    "",
    "Fipe: 72.333,00",
    "Por: *62.990,00*",
  ].join("\n"));
});
caso("Captur com citacao (producao): a fazer que a IA virou em feito sai pela traducao da fonte", () => {
  const raw = JSON.stringify({ itens: [
    { fonte: "Câmbio automático", saida: "Câmbio automático" },
    { fonte: "Interna couro", saida: "Interior em couro" },
    { fonte: "Polimento", saida: "Polimento recente" },
    { fonte: "Higienização", saida: "Higienização feita" },
    { fonte: "Faz 3 peças", saida: "Motor com 3 peças trocadas" },
  ] });
  assert.deepEqual(lerItens(raw, CAPTUR)?.linhas,
    ["Câmbio automático", "Interior em couro", "Fazer polimento", "Fazer higienização", "Pintar 3 peças"]);
});

caso("HR-V: 'Sem detalhes mecânicos' inventado cai; 'faz 3 peças' vira 'Pintar 3 peças' no fim", () => {
  const vendedor = "HRV EXL 1.8 2016\n90.000 km\nManual e chave reserva\nRevisada\nfaz 3 peças\nPneus novos\nPor 74.990";
  const daIa = "Manual e chave reserva\nRevisada\nSem detalhes mecânicos\nPneus novos";
  const v = extractWithRegex(vendedor)!;
  const anuncio = formatVehicleAd({ ...v, rawDescription: conferirComOVendedor(daIa, vendedor) }, { profitMarginPercent: 0 });
  assert.doesNotMatch(anuncio, /sem detalhes/i);
  assert.match(anuncio, /\n\nPintar 3 peças\n\nPor/);
});
caso("sem IA (regex), o defeito tambem vai pro fim da lista", () => {
  const vendedor = "Onix LT 1.0 2021\n50.000 km\nPolimento\nTeto solar\nSem retoques\nPor 60.000";
  const v = extractWithRegex(vendedor)!;
  const anuncio = formatVehicleAd({ ...v, rawDescription: vendedor }, { profitMarginPercent: 0 });
  assert.match(anuncio, /\nTeto solar\nSem retoques\n\nFazer polimento\n\nPor/);
});

async function casosAssincronos() {
  // A regra do km abreviado vive na validacao comum ao regex e ao GPT.
  const { extractVehicleFromText } = await import("../src/lib/ai");
  const v = await extractVehicleFromText(HILUX);
  caso("Hilux: '97km' num carro de 2022 vira 97.000", () => assert.equal(v?.km, 97000));
  caso("Hilux: anuncio sai no padrao", () => {
    const anuncio = formatVehicleAd(
      { ...v!, price: 186000, fipePrice: 232824, rawDescription: HILUX },
      { profitMarginPercent: 0 }
    );
    assert.equal(anuncio, [
      "*Hilux SRX 4X4 2.8T Diesel (aut.)*",
      "2022 | 97.000km",
      "",
      "IPVA 26 pago",
      "",
      "Fipe: 232.824,00",
      "Por: *186.000,00*",
    ].join("\n"));
  });
}

casosAssincronos().then(() => {
  if (falhas > 0) {
    console.error(`\n${falhas} caso(s) falharam`);
    process.exit(1);
  }
  console.log("\nOK — padrao de anuncio, cambio e estado conferidos.");
  process.exit(0);
});
