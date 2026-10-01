#!/usr/bin/env tsx
/**
 * A lista de exemplos do cliente: "VEIO ASSIM" (texto do vendedor) e
 * "PRECISA FICAR ASSIM". Cada exemplo novo entra aqui -- o que ele corrigiu
 * uma vez nao pode voltar.
 *
 * Sem rede: a resposta da IA usada aqui e a que o deepseek-v4-pro deu de
 * verdade para o mesmo texto.
 *
 * Uso: pnpm --filter web exec tsx tests/exemplos-do-cliente.test.ts
 */
import assert from "node:assert/strict";
import { extractWithRegex } from "../src/lib/ai/regex";
import { conferirComOVendedor, lerItens } from "../src/lib/ad-cleaner";
import { padronizarLinha } from "../src/lib/corpo-do-anuncio";
import { formatVehicleAd } from "../src/lib/vehicle-formatter";

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
const J = (...l: string[]) => l.join("\n");
const corpo = (anuncio: string) => anuncio.split("\n").slice(3, -3);

// ── 01/10/2026 ─────────────────────────────────────────────────────────────
const TIGUAN = J(
  "TIGUAN ALLSPACE R-Line 350 Tsi 2.0 4x4", "", "ANO 2019 | 147.498Km", "Última com 70 mil km ", "",
  "IPVA 2026 PAGO", "", "Teto solar ☀️", "Ar gelando 🥶", "4 pneus fraco", "",
  "Avaliação: Motor e cambio ok, bom de andar, carro praticamente pronto, faz 2 pincéis 1 retoque, trocar pára-brisa.",
  "", "FIPE: R$ 139.746,00", "", "Valor: R$ 106.900,00",
);
const AVALIACAO = "Avaliação: Motor e cambio ok, bom de andar, carro praticamente pronto, faz 2 pincéis 1 retoque, trocar pára-brisa.";
const TIGUAN_IA = JSON.stringify({ itens: [
  { fonte: "Última com 70 mil km", saida: "Última revisão com 70.000km" },
  { fonte: "IPVA 2026 PAGO", saida: "IPVA 26 pago" },
  { fonte: "Teto solar ☀️", saida: "Teto-solar" },
  { fonte: "4 pneus fraco", saida: "4 pneus ruins" },
  ...["Motor e câmbio bons", "Bom de andar", "Veículo praticamente pronto", "Fazer 2 pincéis", "Fazer 1 retoque", "Trocar para-brisa"]
    .map((saida) => ({ fonte: AVALIACAO, saida })),
] });

caso("Tiguan: km e o do carro, nao o da ultima revisao", () => {
  assert.equal(extractWithRegex(TIGUAN)?.km, 147498);
});
caso("Tiguan: a linha 'Avaliação' vira um item por informacao", () => {
  const lido = lerItens(TIGUAN_IA, TIGUAN)!;
  const v = extractWithRegex(TIGUAN)!;
  const anuncio = formatVehicleAd(
    { ...v, transmission: "AUTOMATICO", rawDescription: conferirComOVendedor(lido.linhas.join("\n"), TIGUAN, lido.cobertas) },
    { profitMarginPercent: 0 },
  );
  assert.deepEqual(corpo(anuncio), [
    "Teto-solar",
    "IPVA 26 pago",
    "Bom de andar",
    "Motor e câmbio bons",
    "Veículo praticamente pronto",
    "Última revisão na concessionária 70.000km",
    "",
    "Trocar para-brisa",
    "Fazer 2 pincéis",
    "Fazer 1 retoque",
    "4 pneus ruins",
  ]);
  assert.equal(anuncio.split("\n")[1], "2019 | 147.000km");
});
caso("'Última com 70 mil km' e a ultima revisao na concessionaria", () => {
  for (const l of ["Última com 70 mil km", "Última revisão com 70.000km", "ultima com 70.000 km"]) {
    assert.deepEqual(padronizarLinha(l), ["Última revisão na concessionária 70.000km"], l);
  }
});

const C4 = J(
  "MARGEMMMM 🔥🔥🔥", "", "C4 Cactus Feel 1.6", "", "Completa ", "62.000km", "NÃO É O MOTOR THP", "2022",
  "Automática ", "Pneus bons ", "Só polir e higienizar ", "", "Fipe: 73.400", "Valor: 60.000", "", "📍 (comigo)",
);
caso("C4 Cactus: a chamada 'MARGEMMMM' nao vira o modelo", () => {
  assert.equal(extractWithRegex(C4)?.model, "C4 Cactus Feel 1.6");
});
caso("C4 Cactus: sai exatamente como o cliente escreveu", () => {
  const v = extractWithRegex(C4)!;
  // O que a IA devolveu: ela separa polimento e higienizacao da mesma frase.
  const raw = JSON.stringify({ itens: [
    { fonte: "Completa", saida: "Completa" },
    { fonte: "NÃO É O MOTOR THP", saida: "Não é o motor THP" },
    { fonte: "Pneus bons", saida: "Pneus bons" },
    { fonte: "Só polir e higienizar", saida: "Fazer polimento" },
    { fonte: "Só polir e higienizar", saida: "Fazer higienização" },
  ] });
  const lido = lerItens(raw, C4)!;
  const daIa = conferirComOVendedor(lido.linhas.join("\n"), C4, lido.cobertas);
  assert.equal(formatVehicleAd({ ...v, rawDescription: daIa }, { profitMarginPercent: 0 }), J(
    "*C4 Cactus Feel 1.6 (aut.)*",
    "2022 | 62.000km",
    "",
    "Pneus bons",
    "",
    "Fazer polimento e higienização",
    "",
    "Fipe: 73.400,00",
    "Por: *60.000,00*",
  ));
});

caso("CLA e Macan: so ficha tecnica e contato -> corpo vazio", () => {
  const cla = extractWithRegex(J("MERCEDES-BENZ CLA-35 AMG 4MATIC 2.0 TURBO AUT.", "", "ANO 2022/2022", "", "FIPE R$ 313.162", "POR R$ 278.000", "", "33.000 km"))!;
  assert.equal(formatVehicleAd({ ...cla, rawDescription: "" }, { profitMarginPercent: 0 }), J(
    "*CLA-35 AMG 4MATIC 2.0T (aut.)*", "2022 | 33.000km", "", "Fipe: 313.162,00", "Por: *278.000,00*",
  ));
  const macan = extractWithRegex(J("PORSCHE MACAN T 2.0 TURBO 2025/2025", "", "FIPE R$ 518.116", "POR R$ 430.000", "20.000 km"))!;
  assert.equal(formatVehicleAd({ ...macan, transmission: "AUTOMATICO", rawDescription: "" }, { profitMarginPercent: 0 }), J(
    "*Macan T 2.0T (aut.)*", "2025 | 20.000km", "", "Fipe: 518.116,00", "Por: *430.000,00*",
  ));
});

// ── Nivus: "Fipe R$135,41" e 135.410 ────────────────────────────────────
// Lida como R$ 135,41, a FIPE sumia; sem FIPE, o desconto minimo de 10%
// deixava passar um carro a 7,7% da tabela.
const NIVUS = J(
  "Nivus Highline 1.0 Tsi 2026", "Único dono", "Sem retoques", "Manual chave reserva", "Revisões na agência",
  "Estepe sem uso", "Toda original", "Somente 18mil km", "", "Fipe R$135,41", "VENDA 125.000,00",
);
caso("Nivus: FIPE em milhares ('R$135,41') e 135.410", () => {
  const v = extractWithRegex(NIVUS)!;
  assert.equal(v.fipePrice, 135410);
  assert.equal(v.price, 125000);
  assert.ok((1 - v.price / v.fipePrice!) * 100 < 10, "7,7% de desconto: o filtro de 10% barra");
});

if (falhas > 0) {
  console.error(`\n${falhas} caso(s) falharam`);
  process.exit(1);
}
console.log("\nOK — exemplos do cliente conferidos.");
