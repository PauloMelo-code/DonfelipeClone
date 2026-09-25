#!/usr/bin/env tsx
/**
 * Trava do extrator por regex.
 *
 * Este e o caminho GRATUITO: roda antes de qualquer IA e, quando acerta, o
 * anuncio nao custa token nenhum. As heuristicas dele carregam cicatriz de
 * campo, e cada uma esta coberta abaixo:
 *
 *   - "IPVA 2026 pago" NAO e o ano do carro
 *   - "FIPE: 58.000" NAO e o preco
 *   - "OPORTUNIDADE IMPERDIVEL" NAO e o modelo
 *   - "48.990" e quarenta e oito mil, nao quarenta e oito
 *   - "70 mil km" e setenta mil
 *
 * Os valores esperados foram capturados ANTES da quebra do ai.ts em modulos e
 * conferidos identicos depois, anuncio por anuncio.
 *
 * Uso: pnpm --filter web exec tsx tests/ai-regex.test.ts
 */
import assert from "node:assert/strict";
import { extractWithRegex } from "../src/lib/ai/regex";

interface Caso {
  nome: string;
  texto: string;
  esperado: Record<string, unknown> | null;
}

const CASOS: Caso[] = [
  {
    nome: "anuncio completo com FIPE",
    texto:
      "ONIX LT 1.0 TURBO\nAno: 2020/2021\nKm: 45.000\nCor: Branco\nCambio: Automatico\nFIPE: 58.000\nValor: R$ 48.990",
    esperado: {
      model: "ONIX LT 1.0 TURBO",
      year: 2020,
      yearModel: 2021,
      km: 45000,
      price: 48990, // e nao 58000: a linha da FIPE fica de fora do preco
      fipePrice: 58000,
      transmission: "AUTOMATICO",
    },
  },
  {
    nome: "linha de IPVA nao vira o ano",
    texto: "HB20 COMFORT 1.0\n2019/2020\nIPVA 2026 pago\n70 mil km\nR$ 42.500",
    esperado: {
      model: "HB20 COMFORT 1.0",
      year: 2019, // e nao 2026
      yearModel: 2020,
      km: 70000,
      price: 42500,
    },
  },
  {
    nome: "chamada promocional nao vira o modelo",
    texto:
      "OPORTUNIDADE IMPERDIVEL!!\nRepasses Sul Premium\nCOROLLA XEI 2.0\nAno 2021\nKm 38.000\nValor 118.900",
    esperado: {
      model: "COROLLA XEI 2.0", // e nao "OPORTUNIDADE IMPERDIVEL"
      year: 2021,
      km: 38000,
      price: 118900,
    },
  },
  {
    // O fornecedor escreve um cabecalho antes do anuncio: "ESSE VEICULO ESTA
    // EM ...". O titulo saia com a frase no lugar do carro.
    nome: "cabecalho do fornecedor nao vira o modelo",
    texto:
      "\u{1F4CD} ESSE VEÍCULO ESTÁ EM\n(Balneário Camboriú - SC), agendar visita ou enviamos o veículo pra você após o pagamento.\n\n\u{1F697} SPIN PREMIER 1.8\n\nAno: 2025\nKm: 46 mil\nCombustível: FLEX\nCambio: AUTOMÁTICA\n\nFIPE: R$ 119.400\nR$ 94.990",
    esperado: {
      model: "SPIN PREMIER 1.8",
      year: 2025,
      km: 46000, // "46 mil", nao 46
      price: 94990,
      fipePrice: 119400,
      transmission: "AUTOMATICO",
      fuel: "FLEX",
      state: "SC",
    },
  },
  {
    nome: "preco com centavos, tabela FIPE, estado e telefone",
    texto:
      "COMPASS LONGITUDE DIESEL 2.0 4x4\n2022/2022\n52.300 km\nPreco: R$ 168.900,00\nTabela FIPE R$ 189.000\nUnico dono, revisado\nPorto Alegre RS\nContato 51 99999-8888",
    esperado: {
      model: "COMPASS LONGITUDE DIESEL 2.0 4x4",
      year: 2022,
      yearModel: 2022,
      km: 52300,
      price: 168900,
      fipePrice: 189000,
      fuel: "DIESEL",
      state: "RS",
      sellerPhone: "51 99999-8888",
    },
  },
  {
    nome: "emoji no titulo nao atrapalha",
    texto:
      "\u{1F525} SW4 SRX 7 LUGARES \u{1F525}\nano 2021\nkm 89.500\nR$ 289.900\nplaca ABC1D23\ncor Prata",
    esperado: {
      model: "SW4 SRX 7 LUGARES",
      year: 2021,
      km: 89500,
      price: 289900,
    },
  },
  {
    nome: "cambio e combustivel em linha propria",
    texto: "GOL 1.6 2015\n120 mil km\nvalor 32.900\ncambio manual\nflex",
    esperado: {
      model: "GOL 1.6 2015",
      year: 2015,
      km: 120000,
      price: 32900,
      transmission: "MANUAL",
      fuel: "FLEX",
    },
  },
  {
    // 18/09/2026: o titulo saiu "Mercadoria Boa E Com Margem (aut.)".
    nome: "frase do vendedor antes do carro nao vira modelo",
    texto:
      "Mercadoria boa e com margem\nC4 Cactus Feel 1.6\n2022\n62.000km\nCompleta\nMotor 1.6\nAutomática\nPneus bons\nFipe 73.400,00\nPor 60.000,00",
    esperado: {
      model: "C4 Cactus Feel 1.6",
      year: 2022,
      km: 62000,
      price: 60000,
      fipePrice: 73400,
      transmission: "AUTOMATICO",
    },
  },
  {
    nome: "texto que nao e anuncio de carro",
    texto: "bom dia pessoal, alguem tem interesse?",
    esperado: null,
  },
  {
    // O "0km" fala dos PNEUS, e o extrator pega a PRIMEIRA ocorrencia de km
    // no texto. Isso mandava pro grupo "2019 | 0km" -- um Corolla usado
    // anunciado como zero-quilometro -- alem de zerar a margem e dar dois
    // pontos de bonus por "km muito baixa" (25/09/2026).
    nome: "pneus 0km nao sao a quilometragem do carro",
    texto: `COROLLA XEI 2.0 FLEX
ANO 2019
4 pneus 0km
Revisado na concessionaria
FIPE R$ 105.000,00
PEDIDA R$ 92.000,00`,
    esperado: null,
  },
  {
    // A km de verdade continua sendo lida, mesmo vindo DEPOIS do "0km".
    nome: "km de verdade depois de um 0km de pneu",
    texto: `COROLLA XEI 2.0 FLEX
ANO 2019
4 pneus 0km
85.000 km
PEDIDA R$ 92.000,00`,
    esperado: {
      model: "COROLLA XEI 2.0 FLEX",
      year: 2019,
      km: 85000,
      price: 92000,
      fuel: "FLEX",
    },
  },
];

/** Campos cobertos pela trava. Os demais ficam de fora de proposito. */
const CAMPOS = [
  "model",
  "year",
  "yearModel",
  "km",
  "price",
  "fipePrice",
  "transmission",
  "fuel",
  "state",
  "sellerPhone",
] as const;

for (const caso of CASOS) {
  const r = extractWithRegex(caso.texto);

  if (caso.esperado === null) {
    assert.equal(r, null, `${caso.nome}: deveria devolver null`);
    continue;
  }

  assert.ok(r, `${caso.nome}: deveria extrair algo`);
  const obtido: Record<string, unknown> = {};
  for (const c of CAMPOS) if (r[c] !== undefined) obtido[c] = r[c];
  assert.deepEqual(obtido, caso.esperado, `${caso.nome}: extracao mudou`);
}

console.log(`OK — extrator por regex estavel em ${CASOS.length} anuncios.`);
