#!/usr/bin/env tsx
/**
 * Trava do padrao do corpo do anuncio: as duas listas de regras do cliente --
 * 15 pontos em 18/09/2026 e 34 em 20/09/2026. Os exemplos abaixo sao os DELE,
 * regra por regra, mais o anuncio da Ranger que ele montou a mao como modelo.
 *
 * Onde a lista 2 mudou a lista 1 (retoque, manual/chave, "pronto"), vale a 2.
 *
 * Uso: pnpm --filter web exec tsx tests/corpo-do-anuncio.test.ts
 */
import assert from "node:assert/strict";
import { eAFazer, eObrigatoria, montarCorpo, padronizarLinha } from "../src/lib/corpo-do-anuncio";
import { extractWithRegex } from "../src/lib/ai/regex";
import { formatVehicleAd, tituloDoAnuncio } from "../src/lib/vehicle-formatter";
import { combustivelConfirmado } from "../src/lib/ai/cambio";
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

const ACIMA = "Veículo conservado acima da média";

// ── Lista 1 (18/09/2026) ────────────────────────────────────────────────────

caso("L1.1 trecho todo em maiusculas sai em escrita normal; sigla fica", pares([
  ["VAI COM AS RODAS ORIGINAIS", "Vai com as rodas originais"],
  ["PNEUS AT BONS", "Pneus AT bons"],
  ["Bancos em COURO", "Bancos em couro"],
  ["PLACA J DO RS", "Placa J do RS"],
  ["TETO SOLAR", "Teto-solar"],
  ["TRAÇÃO 4X4", "Tração 4x4"],
]));

caso("L1.2 fazer / refazer / so a quantidade = PINTAR", pares([
  ["Faz 2 peças", "Pintar 2 peças"],
  ["Refazer 2 peças", "Pintar 2 peças"],
  ["2x peças", "Pintar 2 peças"],
  ["1x Peças", "Pintar 1 peça"],
  ["Fazer para-choque dianteiro", "Pintar para-choque dianteiro"],
  ["Fazer dois para-choques", "Pintar 2 para-choques"],
  ["Pintar 4 peças", "Pintar 4 peças"],
  ["Uma peça substituída", "Pintar 1 peça"],
]));

caso("L1.2 o que nao e defeito fica como esta", pares([
  ["Peças originais", "Peças originais"],
  ["Sem retoques", "Sem retoques"],
  ["Sem peças pintadas", "Sem peças pintadas"],
  ["Fazer rodas", "Fazer rodas"],
]));

caso("L1.3 'OK' vira bom / boa / bons, com genero e plural", pares([
  ["Motor OK", "Motor bom"],
  ["Caixa OK", "Caixa boa"],
  ["Suspensão OK", "Suspensão boa"],
  ["Motor, caixa e suspensão OK", "Motor, caixa e suspensão bons"],
  ["Caixa e suspensão ok", "Caixa e suspensão boas"],
  ["Pneus ok", "Pneus bons"],
]));

caso("L1.5 nada a fazer x carro pronto (a lista 2 separou os dois)", pares([
  ["Nada para fazer", "Nada para fazer"],
  ["Não faz nada", "Nada para fazer"],
  ["Não gasta nada", "Nada para fazer"],
  ["SEM CUSTOS", "Nada para fazer"],
  ["Carro pronto", "Veículo pronto para venda"],
  ["PRONTO", "Veículo pronto para venda"],
  ["Pronto para loja", "Veículo pronto para venda"],
]));

caso("L1.6/7/12/15 o que o fornecedor escreveu e nao pode sumir", () => {
  for (const l of [
    "Pneus AT bons", "Nova", "Nova de andar", "Bem nova", "Muito nova", "Impecável", "100% revisada",
    "Revisada", "Veículo de Showroom", ACIMA, "Veículo pronto para venda", "Veículo em excelente estado",
    "Placa RS", "Placa SC", "Placa I", "Placa J", "Placa R",
    "Não aparenta a km que tem", "Pneus XBri", "Pneus XBri meia vida", "Comprou com 10.000km", "Nada para fazer",
  ]) assert.ok(eObrigatoria(l), l);
  assert.ok(!eObrigatoria("Teto-solar"));
  assert.deepEqual(padronizarLinha("Showroom"), ["Veículo de Showroom"]);
  assert.deepEqual(padronizarLinha("PNEUS XBRI NOVOS"), ["Pneus XBri novos"]);
  // Elogio solto vira a frase do cliente -- e essa e que nao pode sumir.
  for (const l of ["Lindo carro", "Linda camioneta", "Carro bem bonito"]) {
    assert.deepEqual(padronizarLinha(l), [ACIMA], l);
  }
});

caso("L1.10 feito x a fazer", pares([
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

caso("L1.14 tempo com o dono", pares([
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
  for (const l of ["Pintar 4 peças", "Fazer 1 retoque", "Fazer polimento", "Trocar volante", "Costurar dois segmentos do banco",
    "Sem chave reserva", "Sem manual", "Para-choque riscado", "Detalhe no para-choque", "IPVA 2026 atrasado", "Nada para fazer"]) {
    assert.ok(eAFazer(l), `a fazer: ${l}`);
  }
  for (const l of ["Sem retoques", "Sem detalhes", "Recém polido", "Pneus trocados", "Revisada", "Com manual",
    "Bateria nova", "Sem multas", "Veículo pronto para venda", ACIMA]) {
    assert.ok(!eAFazer(l), `bom: ${l}`);
  }
});

// ── Lista 2 (20/09/2026) ────────────────────────────────────────────────────

caso("L2.1 leilao e sinistro so aparecem quando existem", () => {
  for (const l of ["Sem leilão", "Não tem leilão", "Sem passagem por leilão", "Sem sinistro",
    "Não tem sinistro", "SEM LEILÃO E SEM SINISTRO", "Leilão: não", "Nunca passou por leilão"]) {
    assert.deepEqual(padronizarLinha(l), [], l);
  }
  for (const l of ["Tem leilão", "Passou por leilão", "Leilão de financeira", "Tem sinistro",
    "Tem média monta no documento", "Sinistro recuperado", "Foi recuperado de sinistro"]) {
    assert.deepEqual(padronizarLinha(l), [l.toLowerCase().startsWith("sem") ? l : padronizarLinha(l)[0]], l);
    assert.ok(eAFazer(padronizarLinha(l)[0]), `leilao/sinistro vai pro fim: ${l}`);
  }
});

caso("L2.2 sem diminutivo", pares([
  ["Bem novinha", "Bem nova"],
  ["Carro novinho", "Veículo novo"],
  ["Rodas novinhas", "Rodas novas"],
  ["Limpinho por dentro", "Limpo por dentro"],
]));

caso("L2.3 manual e chave reserva: 'Com' quando tem, 'Sem' quando nao tem", pares([
  ["Possui manual sem chave reserva", ["Com manual", "Sem chave reserva"]],
  ["Tem manual / sem chave reserva", ["Com manual", "Sem chave reserva"]],
  ["Tem manual não tem chave", ["Com manual", "Sem chave reserva"]],
  ["Manual OK chave não", ["Com manual", "Sem chave reserva"]],
  ["Manual, sem chave cópia", ["Com manual", "Sem chave reserva"]],
  ["Chave reserva, sem manual", ["Com chave reserva", "Sem manual"]],
  ["Manual e chave reserva", "Com manual e chave reserva"],
  ["Manual e chave cópia", "Com manual e chave reserva"],
  ["Manual e chave", "Com manual e chave reserva"],
]));

caso("L2.4 interna, externa e interior viram interno e externo", pares([
  ["Interna e externa bem conservadas", "Interno e externo bem conservados"],
  ["Interior bonito", "Interno bem conservado"],
  ["Interior", "Interno"],
  ["Interior gelo", "Interno gelo"],
  ["Interna zera", "Interno impecável"],
  ["Interno zero", "Interno impecável"],
  ["Interior novo", "Interno impecável"],
  ["Interior impecável", "Interno impecável"],
]));

caso("L2.5/9/11/30/34 glossario da lista 2", pares([
  ["Mala elétrica", "Porta-malas elétrico"],
  ["Teto solar", "Teto-solar"],
  ["Pacote adas", "Pacote ADAS"],
  ["Bancos de couro", "Bancos em couro"],
  ["Trato de loja", "Bem cuidado"],
]));

caso("L2.10 marca e modelo do pneu ficam", pares([
  ["Pneus XBri ATR novos", "Pneus XBri ATR novos"],
  ["PNEUS XBRI ATR NOVOS", "Pneus XBri ATR novos"],
]));

caso("L2.13/15/17 elogio vira a frase do cliente", () => {
  for (const l of ["Carro filé", "Filé", "Filezão", "Filézão", "Filézinho", "Pronto filé",
    "Bem pronto", "Super inteira", "Carro bem bonito", "Muito bonito"]) {
    assert.deepEqual(padronizarLinha(l), [ACIMA], l);
  }
  assert.deepEqual(padronizarLinha("Carro íntegro"), ["Veículo íntegro"]);
  assert.deepEqual(padronizarLinha("Carro em excelente estado"), ["Veículo em excelente estado"]);
  assert.deepEqual(padronizarLinha("Excelente estado"), ["Veículo em excelente estado"]);
});

caso("L2.14 diminutivo de defeito vira 'pequeno'", pares([
  ["Amassadinho na porta traseira", "Pequeno amassado na porta traseira"],
  ["Arranhãozinho", "Pequeno arranhão"],
  ["Risquinho no para-choque", "Pequeno risco no para-choque"],
]));

caso("L2.16 veiculo pronto para venda", pares([
  ["Pronta", "Veículo pronto para venda"],
  ["Pronta só vender", "Veículo pronto para venda"],
  ["Pronto só vender", "Veículo pronto para venda"],
  ["Pronto pra venda", "Veículo pronto para venda"],
]));

caso("L2.18 'carro' vira 'veiculo'", pares([
  ["Carro muito bem cuidado", "Veículo muito bem cuidado"],
  ["Carro de garagem", "Veículo de garagem"],
]));

caso("L2.20/33 titulo de bloco nao entra; o que vem embaixo entra", () => {
  for (const l of ["Gastos necessários", "O que fazer", "Para fazer", "Detalhes para fazer",
    "Custos", "Afazeres", "Observação", "Observações", "Obs.", "Obs:"]) {
    assert.deepEqual(padronizarLinha(l), [], l);
  }
  assert.deepEqual(padronizarLinha("Gastos necessários: Polimento"), ["Fazer polimento"]);
  assert.deepEqual(padronizarLinha("Obs.: faz 2 peças"), ["Pintar 2 peças"]);
});

caso("L2.21 'Só lavar' -> 'Apenas lavar', no fim da lista", () => {
  assert.deepEqual(padronizarLinha("Só lavar"), ["Apenas lavar"]);
  assert.ok(eAFazer("Apenas lavar"));
});

caso("L2.23 'gasta' e quantidade de peca = pintar", pares([
  ["Gasta 2 peças", "Pintar 2 peças"],
  ["Gasta 3 peças", "Pintar 3 peças"],
  ["Gasta 2/3 peças", "Pintar 2/3 peças"],
  ["Gasta 2 pc", "Pintar 2 peças"],
  ["Gasta 1 pç", "Pintar 1 peça"],
  ["Pintar 2 pcs", "Pintar 2 peças"],
  ["Pinta 4 peças", "Pintar 4 peças"],
]));

caso("L2.24 informacao repetida sai, mesmo escrita diferente", () => {
  assert.deepEqual(montarCorpo(["Teto-solar", "Teto solar"]), ["Teto-solar"]);
  assert.deepEqual(montarCorpo(["Pneus bons", "Bons pneus"]), ["Pneus bons"]);
  assert.deepEqual(montarCorpo(["Nova", "Muito nova"]), ["Muito nova"], "fica a que diz mais");
  assert.deepEqual(montarCorpo(["Pintar 2 peças", "Pintar 3 peças"]),
    ["Pintar 3 peças", "Pintar 2 peças"], "quantidade diferente nao e repeticao");
  assert.equal(montarCorpo(["Com manual", "Sem manual"]).filter(Boolean).length, 2, "com x sem nao e repeticao");
});

caso("L2.25 pincel", pares([
  ["Faz 1 pincel", "Fazer 1 pincel"],
  ["Faz 2 pincel", "Fazer 2 pincéis"],
  ["Faz pincel", "Fazer 1 pincel"],
]));

caso("L2.27 retoque pendente vira 'Fazer N retoques'", pares([
  ["Tem 3 retoques para fazer", "Fazer 3 retoques"],
  ["2 retoques", "Fazer 2 retoques"],
  ["Retoques em 2 peças", "Fazer 2 retoques"],
  ["Retoques 4 pc", "Fazer 4 retoques"],
  ["Retocar 1 peça", "Fazer 1 retoque"],
  ["Retocar 2 pç", "Fazer 2 retoques"],
  ["Faz 1 retoque", "Fazer 1 retoque"],
  ["Retoca uma peça", "Fazer 1 retoque"],
  ["Reforçar 1 peça", "Fazer 1 retoque"],
  ["Fazer dois retoques", "Fazer 2 retoques"],
  ["Retoque no para-choque", "Fazer retoque no para-choque"],
]));

caso("L2.28 duas informacoes na mesma linha viram duas", () => {
  assert.deepEqual(padronizarLinha("Boa de andar e boa de pneus"), ["Boa de andar", "Pneus bons"]);
  assert.deepEqual(padronizarLinha("Boa de andar"), ["Boa de andar"], "verbo nao inverte");
  assert.deepEqual(padronizarLinha("Manual e chave reserva"), ["Com manual e chave reserva"], "expressao unica fica");
  assert.deepEqual(padronizarLinha("Motor, caixa e suspensão OK"), ["Motor, caixa e suspensão bons"]);
});

caso("L2.31 opcional basico sai; defeito de roda fica", () => {
  for (const l of ["Rodas de liga leve", "Roda de liga", "Rodas esportivas", "Airbag", "Airbags duplos", "ABS", "Farol de milha", "Airbag e ABS"]) {
    assert.deepEqual(padronizarLinha(l), [], l);
  }
  for (const l of ["Rodas raladas", "Pintar 1 roda", "Recuperar rodas"]) {
    assert.deepEqual(padronizarLinha(l), [l], l);
    assert.ok(eAFazer(l), `defeito de roda fica no fim: ${l}`);
  }
});

caso("L2.32 pneu pra trocar e pneu ruim", pares([
  ["Trocar 1 pneu", "1 pneu ruim"],
  ["Trocar 2 pneus", "2 pneus ruins"],
  ["Trocar pneus", "Pneus ruins"],
  ["Pneus fracos", "Pneus ruins"],
  ["2 pneus fracos", "2 pneus ruins"],
]));

caso("L2.35 ar-condicionado so aparece quando tem problema", () => {
  for (const l of ["Ar condicionado gelando", "Ar gelando", "Ar funcionando", "Ar-condicionado ok"]) {
    assert.deepEqual(padronizarLinha(l), [], l);
  }
  assert.deepEqual(padronizarLinha("Revisar ar-condicionado"), ["Revisar ar-condicionado"]);
  assert.ok(eAFazer("Revisar ar-condicionado"));
  assert.deepEqual(padronizarLinha("Ar condicionado"), ["Ar condicionado"], "o opcional em si fica");
});

// ── Titulo e cabecalho ──────────────────────────────────────────────────────

caso("L2.12 cambio manual sai '(mec.)' no titulo", () => {
  assert.equal(tituloDoAnuncio({ model: "MONTANA 1.2 Turbo Flex 12V 4p Mec.", transmission: "MANUAL" }),
    "Montana 1.2T Flex 12V 4P (mec.)");
  assert.equal(tituloDoAnuncio({ model: "GOL 1.0", transmission: "MANUAL" }), "Gol 1.0 (mec.)");
});

caso("L2.8 ano/modelo sai com dois digitos", () => {
  const cabecalho = (year: number, yearModel?: number) =>
    formatVehicleAd({ model: "FASTBACK AUDACE 1.0 TURBO", year, yearModel, km: 52812, price: 100000, transmission: "AUTOMATICO" },
      { profitMarginPercent: 0 }).split("\n");
  assert.equal(cabecalho(2023, 2024)[0], "*Fastback Audace 1.0T (aut.)*");
  assert.equal(cabecalho(2023, 2024)[1], "2023/24 | 53.000km");
  assert.equal(cabecalho(2022, 2022)[1], "2022 | 53.000km");
  assert.equal(cabecalho(2022)[1], "2022 | 53.000km");
});

caso("L2.19 marca nao e modelo: 'FIAT' numa linha, 'TORO' na outra", () => {
  const texto = `FIAT
TORO 1.3 T270 VOLCANO
FLEX
2022
75.000 km
AUTOMÁTICO
COMPLETA
SEM CUSTOS!
NOVA!
FIPE 115.400,00
POR 99.990,00`;
  const v = extractWithRegex(texto)!;
  assert.equal(v.brand, "FIAT");
  const anuncio = formatVehicleAd({ ...v, rawDescription: texto }, { profitMarginPercent: 0 }).split("\n");
  assert.equal(anuncio[0], "*Toro 1.3T 270 Volcano Flex (aut.)*");
  assert.equal(anuncio[1], "2022 | 75.000km");
  assert.ok(anuncio.includes("Nada para fazer"), anuncio.join(" | "));
  assert.ok(anuncio.includes("Fipe: 115.400,00"));
});

caso("L2.6 a chamada de estoque nao e o titulo", () => {
  const texto = `TIGGO 7 SELECIONADA PARA O ESTOQUE
Tiggo 7 Sport 1.5 Turbo 2025 Autom.
27 mil km Todas revisões na concessionária
BLINDADA CASCO NIVEL III-A
PLACA J do RS
LAUDO CAUTELAR APROVADO
Preciso de R$ 137.500`;
  const v = extractWithRegex(texto)!;
  assert.equal(tituloDoAnuncio(v), "Tiggo 7 Sport 1.5T (aut.)");
});

caso("L2.6 anuncio do cliente inteiro: o Tiggo sai como ele escreveu", () => {
  const texto = `TIGGO 7 SELECIONADA PARA O ESTOQUE
Tiggo 7 Sport 1.5 Turbo 2025 Autom.
27 mil km Todas revisões na concessionária
BLINDADA CASCO NIVEL III-A
PLACA J do RS
LAUDO CAUTELAR APROVADO
Mais barata anunciada no Brasil (Webmotors) R$ 179.900
Preciso de R$ 137.500`;
  const v = extractWithRegex(texto)!;
  const anuncio = formatVehicleAd({ ...v, rawDescription: texto }, { profitMarginPercent: 0 }).split("\n");
  assert.equal(anuncio[0], "*Tiggo 7 Sport 1.5T (aut.)*");
  assert.equal(anuncio[1], "2025 | 27.000km");
  // O km abre a linha, mas a revisao que vem depois dele nao pode sumir.
  assert.ok(anuncio.includes("Todas revisões na concessionária"), anuncio.join(" | "));
  assert.ok(anuncio.includes("Blindada casco nivel III-A"), "numeral romano fica em maiusculas");
  assert.ok(anuncio.includes("Placa J do RS"));
  // O valor do concorrente nao e a Fipe nem a pedida.
  assert.ok(!anuncio.some((l) => l.includes("179.900")), "179.900 e anuncio de concorrente");
  assert.equal(anuncio.at(-1), "Por: *137.500,00*");
});

caso("L2.8 anuncio do cliente inteiro: o Fastback sai como ele escreveu", () => {
  const texto = `FIAT/FASTBACK AUDACE 1.0 200 T. FLEX AUT
ANO/MOD: 2023/2024
KM: 52.812
Teto solar
Bancos de couro
Rodas de liga leve
Ar gelando
Gasta 2 peças
Faz 1 retoque
Sem leilão
FIPE 120.000
POR 99.990`;
  const v = extractWithRegex(texto)!;
  assert.deepEqual(
    formatVehicleAd({ ...v, rawDescription: texto }, { profitMarginPercent: 0 }).split("\n"),
    [
      "*Fastback Audace 1.0T Flex (aut.)*",
      "2023/24 | 53.000km",
      "",
      "Teto-solar",
      "Bancos em couro",
      "",
      "Fazer 1 retoque",
      "Pintar 2 peças",
      "",
      "Fipe: 120.000,00",
      "Por: *99.990,00*",
    ],
  );
});

caso("resposta 3 do cliente: combustivel ESCRITO fica no titulo; o deduzido pela IA nao", () => {
  // Escrito no nome do modelo: fica onde o vendedor pos.
  assert.equal(tituloDoAnuncio({ model: "COMPASS LONGITUDE FLEX T270", fuel: "FLEX", transmission: "AUTOMATICO" }),
    "Compass Longitude Flex T270 (aut.)");
  // Escrito em outra linha: entra antes do cambio.
  assert.equal(tituloDoAnuncio({ model: "TORO 1.3 T270 VOLCANO", fuel: "DIESEL", transmission: "AUTOMATICO",
    rawDescription: "TORO 1.3 T270 VOLCANO\nDIESEL\n2022" }), "Toro 1.3T 270 Volcano Diesel (aut.)");
  // A IA deduziu pelo modelo, o vendedor nao escreveu: nao entra. A Toro existe flex e diesel.
  assert.equal(tituloDoAnuncio({ model: "TORO 1.3 T270 VOLCANO", fuel: "DIESEL", transmission: "AUTOMATICO",
    rawDescription: "TORO 1.3 T270 VOLCANO\n2022\n75.000 km" }), "Toro 1.3T 270 Volcano (aut.)");
  assert.equal(combustivelConfirmado("FLEX", "Onix LT 2021\n50.000 km"), undefined);
  assert.equal(combustivelConfirmado("ETANOL", "Gol 1.0 ÁLCOOL"), "ETANOL", "álcool e etanol");
  assert.equal(combustivelConfirmado("HIBRIDO", "Corolla Cross XRX"), "HIBRIDO", "hibrido muda o rotulo: passa");
  // Hibrido continua virando o rotulo, sem repetir a palavra.
  assert.equal(tituloDoAnuncio({ model: "COROLLA CROSS XRX HYBRID", fuel: "HIBRIDO" }), "Corolla Cross XRX (híbrido)");
});

caso("'Detalhes: 1 peça' (Amarok do cliente, 21/09) vira 'Pintar 1 peça', no bloco de baixo", () => {
  const texto = `Marca: VW
Modelo: Amarok Comf 3.0 v6 diesel 4x4 aut
Ano: 2023
KM: 64.000
Pneus:  Bons
Manual e chave copia ok
IPVA: 2026 confirma
Detalhes: 1 peça

Fipe: R$ 160.400,00
Valor: R$ 137.990,00`;
  assert.deepEqual(padronizarLinha("Detalhes: 1 peça"), ["Pintar 1 peça"]);
  // A IA copiou a linha como estava: a fonte manda, sai no padrao.
  const lido = lerItens(JSON.stringify({ itens: [
    { fonte: "Pneus:  Bons", saida: "Pneus bons" },
    { fonte: "Detalhes: 1 peça", saida: "Detalhes: 1 peça" },
  ] }), texto)!;
  assert.deepEqual(lido.linhas, ["Pneus bons", "Pintar 1 peça"]);
  const v = extractWithRegex(texto)!;
  const anuncio = formatVehicleAd(
    { ...v, rawDescription: conferirComOVendedor(lido.linhas.join("\n"), texto, lido.cobertas) },
    { profitMarginPercent: 0 },
  );
  assert.match(anuncio, /\n\nPintar 1 peça\n\nFipe/, "no bloco de baixo, por ultimo");
  assert.doesNotMatch(anuncio, /Detalhes/);
  // Rotulo vazio nao inventa nada; dois servicos na linha viram dois.
  assert.deepEqual(padronizarLinha("Detalhes: nenhum"), []);
  assert.deepEqual(padronizarLinha("Detalhes: 2 peças e retoque"), ["Pintar 2 peças", "Fazer 1 retoque"],
    "antes saia 'Fazer 2 retoques': a pintura sumia");
  assert.deepEqual(padronizarLinha("Motor, caixa e suspensão OK"), ["Motor, caixa e suspensão bons"], "item bom fica junto");
});

caso("cliente 21/09: 'VENDA' nao se repete; 'Volante gasto' e detalhe vao pro bloco de baixo; Diesel fica", () => {
  // Toro do cliente, como veio do fornecedor.
  const toro = "Toro ultra DIESEL\n120 mil km\n2023\n\nFipe 138.000,00\nVENDA 110.000,00";
  const v = extractWithRegex(toro)!;
  assert.equal(v.price, 110000, "'VENDA' e o preco");
  const anuncio = formatVehicleAd({ ...v, transmission: "AUTOMATICO", rawDescription: toro }, { profitMarginPercent: 0 });
  assert.equal(anuncio.split("\n")[0], "*Toro Ultra Diesel (aut.)*");
  assert.doesNotMatch(anuncio, /\nVenda/i, "o preco ja esta no Por:, nao repete no corpo");
  // Como a IA de extracao devolveu em producao: modelo sem o combustivel.
  assert.equal(tituloDoAnuncio({ model: "Toro Ultra", fuel: "DIESEL", transmission: "AUTOMATICO", rawDescription: toro }),
    "Toro Ultra Diesel (aut.)");

  for (const l of ["Volante gasto", "Banco gasto", "1 Detalhe banco motorista", "Detalhe na porta", "Pequeno detalhe no capô"]) {
    assert.ok(eAFazer(padronizarLinha(l)[0]), `defeito: ${l}`);
  }
  for (const l of ["Sem detalhes", "Mais detalhes no privado", "Detalhes no whats"]) {
    assert.ok(!eAFazer(l), `nao e defeito: ${l}`);
  }
  // O print do cliente: volante e detalhe no fim, junto do "Pintar 4 peças".
  assert.deepEqual(
    montarCorpo(["Placa I", "Com manual", "Volante gasto", "Bancos em couro", "Com chave reserva", "1 Detalhe banco motorista", "Pintar 4 peças"]),
    ["Placa I", "Com manual", "Bancos em couro", "Com chave reserva", "", "1 Detalhe banco motorista", "Pintar 4 peças", "Volante gasto"],
  );
});

caso("L2.22 marca sai do titulo, qualquer que seja", () => {
  const t = (model: string) => tituloDoAnuncio({ model, transmission: "AUTOMATICO" });
  assert.equal(t("RANGE ROVER EVOQUE P250 SE R-DYNAMIC"), "Evoque P250 SE R-Dynamic (aut.)");
  assert.equal(t("LAND ROVER RANGE ROVER VELAR P340"), "Velar P340 (aut.)");
  assert.equal(t("RANGE ROVER SPORT HSE"), "Sport HSE (aut.)");
  assert.equal(t("PORSCHE CAYENNE S"), "Cayenne S (aut.)");
  assert.equal(t("JAGUAR F-PACE R-SPORT"), "F-Pace R-Sport (aut.)");
  assert.equal(t("CHRYSLER 300C"), "300C (aut.)");
  assert.equal(t("CITROËN C4 CACTUS FEEL"), "C4 Cactus Feel (aut.)");
  assert.equal(t("PEUGEOT 208 GRIFFE"), "208 Griffe (aut.)");
});

caso("L2.29 'Tabela' e 'Fifa' sao a Fipe, nunca o preco", () => {
  const texto = "Onix LT 1.0 2021\n50.000 km\nTabela 134.000,00\nFaço: 113.900,00";
  const v = extractWithRegex(texto)!;
  assert.equal(v.fipePrice, 134000);
  assert.equal(v.price, 113900);
  const anuncio = formatVehicleAd({ ...v, rawDescription: texto }, { profitMarginPercent: 0 });
  assert.match(anuncio, /Fipe: 134\.000,00\nPor: \*113\.900,00\*$/);
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

caso("L1.9 dois blocos: o bom do curto pro longo, linha em branco, o a fazer do longo pro curto", () => {
  assert.deepEqual(
    montarCorpo(["Revisões na concessionária", "Pintar 4 peças", "Pneus bons", "Trocar volante", "Vai com as rodas originais",
      "Fazer polimento", "IPVA 26 pago", "Costurar dois segmentos do banco", "Com manual e chave reserva"]),
    ["Pneus bons", "IPVA 26 pago", "Vai com as rodas originais", "Revisões na concessionária", "Com manual e chave reserva",
      "", "Costurar dois segmentos do banco", "Fazer polimento", "Trocar volante", "Pintar 4 peças"],
  );
  assert.deepEqual(montarCorpo(["Pintar 1 peça"]), ["Pintar 1 peça"], "um bloco so nao ganha linha em branco");
});

const CORPO_RANGER = (gomos: string, direcao: string) => [
  "Pneus bons", "IPVA 26 pago", "Vai com as rodas originais", "Revisões na concessionária", "Com manual e chave reserva",
  "",
  gomos, "Fazer polimento", direcao, "Pintar 4 peças",
];

caso("L1.9 Ranger sem IA nenhuma: o anuncio ja sai nos dois blocos", () => {
  const v = extractWithRegex(RANGER)!;
  const corpo = formatVehicleAd({ ...v, transmission: "AUTOMATICO", rawDescription: RANGER }, { profitMarginPercent: 0 })
    .split("\n").slice(3, -3);
  assert.deepEqual(corpo, CORPO_RANGER("Costurar dois gomos do banco", "Trocar direção"));
});

caso("L1.9 Ranger com a IA citando o vendedor: o corpo sai igual ao que o cliente montou a mao", () => {
  const raw = JSON.stringify({ itens: [
    { fonte: "Pneus bons", saida: "Pneus bons" },
    { fonte: "Manual e chave", saida: "Com manual e chave reserva" },
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
  assert.deepEqual(corpo, CORPO_RANGER("Costurar dois segmentos do banco", "Trocar volante"));
});

caso("a IA omitiu o que nao pode sumir: volta pro anuncio, ja no padrao", () => {
  const vendedor = "Hilux SRV 2020\n90 mil km\nTeto solar\nPLACA J DO RS\nnao aparenta a km que tem\nPneus XBri novos\nPronto\nShowroom\nPor 200.000";
  const lido = lerItens(JSON.stringify({ itens: [{ fonte: "Teto solar", saida: "Teto solar" }] }), vendedor)!;
  assert.deepEqual(conferirComOVendedor(lido.linhas.join("\n"), vendedor, lido.cobertas).split("\n"),
    ["Teto-solar", "Placa J do RS", "Nao aparenta a km que tem", "Pneus XBri novos", "Veículo pronto para venda", "Veículo de Showroom"]);
});

caso("respostas do cliente: km no milhar mais proximo; titulo sem o '+', com V6 e 4X4", () => {
  const anuncio = (km: number) =>
    formatVehicleAd({ model: "FORD RANGER 3.0 V6 TURBO LIMITED+ 4X4", year: 2026, km, price: 271990, transmission: "AUTOMATICO" },
      { profitMarginPercent: 0 }).split("\n");
  assert.equal(anuncio(27946)[0], "*Ranger 3.0T V6 Limited 4X4 (aut.)*");
  assert.equal(anuncio(27946)[1], "2026 | 28.000km");
  assert.equal(anuncio(27400)[1], "2026 | 27.000km");
  assert.equal(anuncio(27500)[1], "2026 | 28.000km");
  assert.equal(anuncio(108000)[1], "2026 | 108.000km");
  assert.equal(anuncio(400)[1], "2026 | 400km", "abaixo de mil nao vira 0km");
  assert.equal(tituloDoAnuncio({ model: "RANGER LIMITED + 4X4" }), "Ranger Limited 4X4");
});

caso("L1.4 cambio que ja esta no titulo sai do corpo; 'Manual' de carro automatico e o manual do dono", () => {
  const base = { model: "A250 2.0T Vision", year: 2020, km: 50000, price: 150000 };
  const corpo = (transmission: string, texto: string) =>
    formatVehicleAd({ ...base, transmission, rawDescription: texto }, { profitMarginPercent: 0 }).split("\n").slice(3, -2);
  assert.deepEqual(corpo("AUTOMATICO", "Câmbio automático\nTeto solar\nAutomática"), ["Teto-solar"]);
  assert.deepEqual(corpo("MANUAL", "Câmbio manual\nTeto solar\nManual"), ["Teto-solar"]);
  assert.deepEqual(corpo("AUTOMATICO", "Teto solar\nManual"), ["Manual", "Teto-solar"]);
});

caso("L1.7 linha da placa nunca e filtrada como localizacao", () => {
  const texto = "Onix LT 1.0 2021\n50.000 km\nPlaca RS\nPlaca de Porto Alegre\nRS\nPor 60.000";
  const v = extractWithRegex(texto)!;
  const anuncio = formatVehicleAd({ ...v, rawDescription: texto }, { profitMarginPercent: 0 });
  assert.match(anuncio, /\nPlaca RS\nPlaca de Porto Alegre\n/);
});

if (falhas > 0) {
  console.error(`\n${falhas} caso(s) falharam`);
  process.exit(1);
}
console.log("\nOK — padrao do corpo do anuncio conferido.");
