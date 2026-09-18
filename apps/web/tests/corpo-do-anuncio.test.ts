#!/usr/bin/env tsx
/**
 * Trava do padrao do corpo do anuncio: a lista de 15 regras que o cliente
 * mandou em 18/09/2026. Os exemplos abaixo sao os DELE, regra por regra, mais
 * o anuncio da Ranger que ele montou a mao como modelo.
 *
 * Uso: pnpm --filter web exec tsx tests/corpo-do-anuncio.test.ts
 */
import assert from "node:assert/strict";
import { eAFazer, eObrigatoria, montarCorpo, padronizarLinha } from "../src/lib/corpo-do-anuncio";
import { extractWithRegex } from "../src/lib/ai/regex";
import { formatVehicleAd, tituloDoAnuncio } from "../src/lib/vehicle-formatter";
import { conferirComOVendedor, lerItens } from "../src/lib/ad-cleaner";

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
/** Cada par e [o que o fornecedor escreveu, como sai]. */
const pares = (tabela: [string, string | string[]][]) => () => {
  for (const [entra, sai] of tabela) assert.deepEqual(padronizarLinha(entra), [sai].flat(), entra);
};

caso("1. trecho todo em maiusculas sai em escrita normal; sigla fica", pares([
  ["VAI COM AS RODAS ORIGINAIS", "Vai com as rodas originais"],
  ["PNEUS AT BONS", "Pneus AT bons"],
  ["Bancos em COURO", "Bancos em couro"],
  ["PLACA J DO RS", "Placa J do RS"],
  ["TETO SOLAR", "Teto solar"],
  ["TRAÇÃO 4X4", "Tração 4x4"],
]));

caso("2. fazer / refazer / so a quantidade = PINTAR", pares([
  ["Faz 2 peças", "Pintar 2 peças"],
  ["Refazer 2 peças", "Pintar 2 peças"],
  ["2x peças", "Pintar 2 peças"],
  ["1x Peças", "Pintar 1 peça"],
  ["Fazer para-choque dianteiro", "Pintar para-choque dianteiro"],
  ["Fazer dois para-choques", "Pintar 2 para-choques"],
  ["Pintar 4 peças", "Pintar 4 peças"],
  ["Uma peça substituída", "Pintar 1 peça"],
]));

caso("2. falou em retoque = RETOCAR", pares([
  ["Retoque 2 peças", "Retocar 2 peças"],
  ["Reforçar 1 peça", "Retocar 1 peça"],
  ["Fazer dois retoques", "Retocar 2 peças"],
  ["Faz 1 retoque", "Retocar 1 peça"],
  ["Retoca uma peça", "Retocar 1 peça"], // regra 8
  ["Retocar 1 peça", "Retocar 1 peça"],
]));

caso("2. o que nao e defeito fica como esta", pares([
  ["Peças originais", "Peças originais"],
  ["Sem retoques", "Sem retoques"],
  ["Sem peças pintadas", "Sem peças pintadas"],
  ["Fazer rodas", "Fazer rodas"],
]));

caso("3. 'OK' vira bom / boa / bons, com genero e plural", pares([
  ["Motor OK", "Motor bom"],
  ["Caixa OK", "Caixa boa"],
  ["Suspensão OK", "Suspensão boa"],
  ["Motor, caixa e suspensão OK", "Motor, caixa e suspensão bons"],
  ["Caixa e suspensão ok", "Caixa e suspensão boas"],
  ["Pneus ok", "Pneus bons"],
]));

caso("5. carro pronto = 'Nada para fazer'", pares([
  ["Nada para fazer", "Nada para fazer"],
  ["Não faz nada", "Nada para fazer"],
  ["Carro pronto", "Nada para fazer"],
  ["PRONTO", "Nada para fazer"],
  ["Pronto para loja", "Nada para fazer"],
  ["Não gasta nada", "Nada para fazer"],
]));

caso("6, 7, 12, 15. o que o fornecedor escreveu e nao pode sumir", () => {
  for (const l of [
    "Pneus AT bons", "Nova", "Nova de andar", "Bem nova", "Muito nova", "Impecável", "100% revisada",
    "Revisada", "Lindo carro", "Lindo veículo", "Linda camioneta", "Carro de Showroom",
    "Placa RS", "Placa SC", "Placa I", "Placa J", "Placa R",
    "Não aparenta a km que tem", "Pneus XBri", "Pneus XBri meia vida", "Comprou com 10.000km", "Nada para fazer",
  ]) assert.ok(eObrigatoria(l), l);
  assert.ok(!eObrigatoria("Teto solar"));
  assert.deepEqual(padronizarLinha("Showroom"), ["Carro de Showroom"]);
  assert.deepEqual(padronizarLinha("PNEUS XBRI NOVOS"), ["Pneus XBri novos"]);
});

caso("10. feito x a fazer", pares([
  ["Polido", "Recém polido"],
  ["Higienizada", "Recém higienizado"],
  ["Polido + higienizado", "Recém polido e higienizado"],
  ["Polir", "Fazer polimento"],
  ["Polimento", "Fazer polimento"],
  ["Fazer um polimento", "Fazer polimento"],
  ["Higienizar", "Fazer higienização"],
  ["Higienização", "Fazer higienização"],
  ["Polir e higienizar", "Fazer polimento e higienização"],
  ["Só polir e higienizar", "Fazer polimento e higienização"],
  ["Polimento recente", "Recém polido"],
  ["Polimento no capô", "Polimento no capô"],
]));

caso("11. tem um e nao tem o outro: duas linhas; tem os dois: uma", pares([
  ["Manual, sem chave cópia", ["Tem manual", "Não tem chave reserva"]],
  ["Chave reserva, sem manual", ["Tem chave reserva", "Não tem manual"]],
  ["Manual e chave reserva", "Manual e chave reserva"],
  ["Manual e chave cópia", "Manual e chave reserva"],
  ["Manual e chave", "Manual e chave reserva"],
]));

caso("14. tempo com o dono", pares([
  ["Dono desde os 10 mil km.", "Comprou com 10.000km"],
  ["Dono desde 0km", "Comprou 0km"],
]));

caso("glossario: CSS e IPVA como o cliente escreve", pares([
  ["Revisões na CSS", "Revisões na concessionária"],
  ["IPVA 2026 PAGO", "IPVA 26 pago"],
  ["ipva 26 pg", "IPVA 26 pago"],
  ["Ipva pago", "IPVA pago"],
  ["IPVA 2026 atrasado", "IPVA 2026 atrasado"],
]));

caso("bloco de baixo: o que o carro precisa; elogio negado e servico feito ficam em cima", () => {
  for (const l of ["Pintar 4 peças", "Retocar 1 peça", "Fazer polimento", "Trocar volante", "Costurar dois segmentos do banco",
    "Não tem chave reserva", "Sem manual", "Para-choque riscado", "Detalhe no para-choque", "IPVA 2026 atrasado", "Nada para fazer"]) {
    assert.ok(eAFazer(l), `a fazer: ${l}`);
  }
  for (const l of ["Sem retoques", "Sem detalhes", "Recém polido", "Pneus trocados", "Revisada", "Tem manual", "Bateria nova", "Sem multas"]) {
    assert.ok(!eAFazer(l), `bom: ${l}`);
  }
});

// ── 9. O anuncio da Ranger, como o cliente montou ───────────────────────
const RANGER = `FORD RANGER 3.0 V6 TURBO LIMITED+ 4X4

2026 • 27.946 KM

Pneus bons
Manual e chave
Revisões na CSS
Vai com as rodas originais
IPVA 2026 PAGO ✅
Pintar 4 peças
Fazer um polimento
Trocar direção
Costurar dois gomos do banco

FIPE R$304.160,00
POR R$271.990,00`;

caso("9. dois blocos: o bom do curto pro longo, linha em branco, o a fazer do longo pro curto", () => {
  assert.deepEqual(
    montarCorpo(["Revisões na concessionária", "Pintar 4 peças", "Pneus bons", "Trocar volante", "Vai com as rodas originais",
      "Fazer polimento", "IPVA 26 pago", "Costurar dois segmentos do banco", "Manual e chave reserva"]),
    ["Pneus bons", "IPVA 26 pago", "Manual e chave reserva", "Vai com as rodas originais", "Revisões na concessionária",
      "", "Costurar dois segmentos do banco", "Fazer polimento", "Trocar volante", "Pintar 4 peças"],
  );
  assert.deepEqual(montarCorpo(["Teto solar", "teto solar", "Pneus bons"]), ["Teto solar", "Pneus bons"], "sem repetir linha");
  assert.deepEqual(montarCorpo(["Pintar 1 peça"]), ["Pintar 1 peça"], "um bloco so nao ganha linha em branco");
});

caso("9. Ranger sem IA nenhuma: o anuncio ja sai nos dois blocos", () => {
  const v = extractWithRegex(RANGER)!;
  const corpo = formatVehicleAd({ ...v, transmission: "AUTOMATICO", rawDescription: RANGER }, { profitMarginPercent: 0 })
    .split("\n").slice(3, -3);
  assert.deepEqual(corpo, [
    "Pneus bons", "IPVA 26 pago", "Manual e chave reserva", "Vai com as rodas originais", "Revisões na concessionária",
    "",
    "Costurar dois gomos do banco", "Fazer polimento", "Trocar direção", "Pintar 4 peças",
  ]);
});

caso("9. Ranger com a IA citando o vendedor: o corpo sai igual ao que o cliente montou a mao", () => {
  const raw = JSON.stringify({ itens: [
    { fonte: "Pneus bons", saida: "Pneus bons" },
    { fonte: "Manual e chave", saida: "Manual e chave reserva" },
    { fonte: "Revisões na CSS", saida: "Revisões na concessionária" },
    { fonte: "Vai com as rodas originais", saida: "Vai com as rodas originais" },
    { fonte: "IPVA 2026 PAGO", saida: "IPVA 2026 pago" },
    { fonte: "Pintar 4 peças", saida: "Pintar 4 peças" },
    { fonte: "Fazer um polimento", saida: "Polimento feito" }, // a IA virou em feito: perde pra fonte
    { fonte: "Trocar direção", saida: "Trocar volante" },
    { fonte: "Costurar dois gomos do banco", saida: "Costurar dois segmentos do banco" },
    { fonte: "Garantia de fábrica", saida: "Garantia de fábrica" }, // nao esta no texto: cai
  ] });
  const lido = lerItens(raw, RANGER)!;
  const v = extractWithRegex(RANGER)!;
  const corpo = formatVehicleAd(
    { ...v, transmission: "AUTOMATICO", rawDescription: conferirComOVendedor(lido.linhas.join("\n"), RANGER, lido.cobertas) },
    { profitMarginPercent: 0 },
  ).split("\n").slice(3, -3);
  assert.deepEqual(corpo, [
    "Pneus bons", "IPVA 26 pago", "Manual e chave reserva", "Vai com as rodas originais", "Revisões na concessionária",
    "",
    "Costurar dois segmentos do banco", "Fazer polimento", "Trocar volante", "Pintar 4 peças",
  ]);
});

caso("a IA omitiu o que nao pode sumir: volta pro anuncio, ja no padrao", () => {
  const vendedor = "Hilux SRV 2020\n90 mil km\nTeto solar\nPLACA J DO RS\nnao aparenta a km que tem\nPneus XBri novos\nPronto\nShowroom\nPor 200.000";
  const lido = lerItens(JSON.stringify({ itens: [{ fonte: "Teto solar", saida: "Teto solar" }] }), vendedor)!;
  assert.deepEqual(conferirComOVendedor(lido.linhas.join("\n"), vendedor, lido.cobertas).split("\n"),
    ["Teto solar", "Placa J do RS", "Nao aparenta a km que tem", "Pneus XBri novos", "Nada para fazer", "Carro de Showroom"]);
});

caso("4. cambio que ja esta no titulo sai do corpo; 'Manual' de carro automatico e o manual do dono", () => {
  const base = { model: "A250 2.0T Vision", year: 2020, km: 50000, price: 150000 };
  const corpo = (transmission: string, texto: string) =>
    formatVehicleAd({ ...base, transmission, rawDescription: texto }, { profitMarginPercent: 0 }).split("\n").slice(3, -2);
  assert.deepEqual(corpo("AUTOMATICO", "Câmbio automático\nTeto solar\nAutomática"), ["Teto solar"]);
  assert.deepEqual(corpo("MANUAL", "Câmbio manual\nTeto solar\nManual"), ["Teto solar"]);
  assert.deepEqual(corpo("AUTOMATICO", "Teto solar\nManual"), ["Manual", "Teto solar"]);
});

caso("7. linha da placa nunca e filtrada como localizacao", () => {
  const texto = "Onix LT 1.0 2021\n50.000 km\nPlaca RS\nPlaca de Porto Alegre\nRS\nPor 60.000";
  const v = extractWithRegex(texto)!;
  const anuncio = formatVehicleAd({ ...v, rawDescription: texto }, { profitMarginPercent: 0 });
  assert.match(anuncio, /\nPlaca RS\nPlaca de Porto Alegre\n/);
});

caso("13. marca sai do titulo, qualquer que seja", () => {
  const t = (model: string) => tituloDoAnuncio({ model, transmission: "AUTOMATICO" });
  assert.equal(t("RANGE ROVER EVOQUE P250 SE R-DYNAMIC"), "Evoque P250 SE R-Dynamic (aut.)");
  assert.equal(t("LAND ROVER RANGE ROVER VELAR P340"), "Velar P340 (aut.)");
  assert.equal(t("RANGE ROVER SPORT HSE"), "Range Rover Sport HSE (aut.)");
  assert.equal(t("PORSCHE CAYENNE S"), "Cayenne S (aut.)");
  assert.equal(t("JAGUAR F-PACE R-SPORT"), "F-Pace R-Sport (aut.)");
  assert.equal(t("CHRYSLER 300C"), "300C (aut.)");
  assert.equal(t("CITROËN C4 CACTUS FEEL"), "C4 Cactus Feel (aut.)");
  assert.equal(t("PEUGEOT 208 GRIFFE"), "208 Griffe (aut.)");
});

if (falhas > 0) {
  console.error(`\n${falhas} caso(s) falharam`);
  process.exit(1);
}
console.log("\nOK — padrao do corpo do anuncio conferido.");
