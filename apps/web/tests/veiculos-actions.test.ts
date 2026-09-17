#!/usr/bin/env tsx
/**
 * Trava das regras de negocio do veiculo.
 *
 * Extrair a FIPE do texto existia em QUATRO lugares e a precificacao em dois.
 * As copias ja tinham divergido: o publish-direct nao reconhecia "procedência"
 * com acento, entao o mesmo carro saia com margem diferente conforme o botao
 * que o operador clicasse. Este teste fixa a versao unica.
 *
 * Precisa de DATABASE_URL: a margem padrao vem das configuracoes.
 * Uso: DATABASE_URL=... pnpm --filter web exec tsx tests/veiculos-actions.test.ts
 */
import assert from "node:assert/strict";
import type { Veiculo } from "../src/lib/db";
import { extrairFipeDoTexto, precificar, prepararAprovacao } from "../src/lib/actions/veiculos";

function testarLeituraDaFipe() {
  const casos: Array<[string, number | null]> = [
    ["FIPE: 58.000", 58000],
    ["fipe r$ 58.000,00", 58000],
    ["FIPE 58 mil", 58000],
    ["Tabela FIPE: 58.000", 58000],
    ["Onix LT 2020 \u{1F697} FIPE: 58.000 \u{1F525}", 58000], // emoji no meio
    ["FIPE R$ 58000", 58000],
    ["carro bom, sem tabela", null],
    ["FIPE: 500", null], // ruido, nao preco de tabela
    ["", null],
  ];
  for (const [texto, esperado] of casos) {
    assert.equal(
      extrairFipeDoTexto(texto),
      esperado,
      `FIPE errada para ${JSON.stringify(texto)}`
    );
  }
  assert.equal(extrairFipeDoTexto(null), null);
}

async function testarPrecificacao() {
  const base = { price: 52000, fipePrice: 58000, km: 80000 };

  // Perto da FIPE (10% de desconto) e com bom sinal -> sai sem margem.
  const bom = await precificar({ ...base, rawDescription: "unico dono, revisado" });
  assert.equal(bom.margemEfetiva, 0, "carro bom perto da FIPE deveria sair sem margem");
  assert.equal(bom.sellingPrice, 52000);

  // O termo com acento: era exatamente o que uma das copias nao reconhecia.
  const comAcento = await precificar({ ...base, rawDescription: "carro com procedência" });
  assert.equal(comAcento.margemEfetiva, 0, "'procedência' com acento deveria contar como bom sinal");

  // Alerta derruba o bom sinal, mesmo perto da FIPE.
  const leilao = await precificar({
    ...base,
    rawDescription: "unico dono, revisado, veio de leilão",
  });
  assert.equal(leilao.margemEfetiva, bom.margem, "carro de leilao deveria manter a margem padrao");

  // Km baixa vale por si so, sem termo nenhum no texto.
  const kmBaixa = await precificar({ ...base, km: 30000, rawDescription: "carro" });
  assert.equal(kmBaixa.margemEfetiva, 0, "km baixa deveria contar como bom sinal");

  // Longe da FIPE: ha espaco para a margem padrao.
  const longe = await precificar({
    price: 30000,
    fipePrice: 58000,
    km: 30000,
    rawDescription: "unico dono",
  });
  assert.equal(longe.margemEfetiva, longe.margem, "carro barato deveria manter a margem padrao");

  // Sem FIPE nao ha como comparar: margem padrao.
  const semFipe = await precificar({ ...base, fipePrice: null, rawDescription: "unico dono" });
  assert.equal(semFipe.margemEfetiva, semFipe.margem);
}

/**
 * O caso que o cliente relatou: carro bom perto da FIPE (margem calculada 0%),
 * ele digita o preco dele na linha "Por:" do card e o grupo recebia o preco
 * do fornecedor. O texto do card e o que vai pro grupo.
 */
async function testarAprovacaoRespeitaOCard() {
  const hilux = {
    model: "HILUX CD SRV 2.7 4X4", brand: "TOYOTA", year: 2015, yearModel: 2015, km: 137000,
    price: 110000, fipePrice: 119000, transmission: "AUTOMATICO", fuel: "FLEX",
    features: "[]", rawDescription: "Hilux CD SRV 2015\nUnico dono\nFipe 119.000\nPor 110.000",
  };

  const digitado = "*Hilux CD SRV 2.7 4X4 (aut.)*\n2015 | 137.000km\n\nUnico dono\n\nFipe: 119.000,00\nPor: *124.900,00*";
  const editado = await prepararAprovacao({ ...hilux, formattedAd: digitado, adEditedAt: new Date() } as unknown as Veiculo);
  assert.equal(editado.margemEfetiva, 0, "o caso do cliente e o de margem calculada zero");
  assert.equal(editado.formattedAd, digitado, "o texto digitado vai como esta, com o preco do operador");
  assert.equal(editado.sellingPrice, 124900, "o preco de venda e o da linha Por:");

  // Texto do sistema, que o card mostrou: tambem vai como esta.
  const gerado = "*HILUX CD SRV (aut.)*\n2015 | 137.000km\n\nPor: *121.000,00*";
  const doSistema = await prepararAprovacao({ ...hilux, formattedAd: gerado, adEditedAt: null } as unknown as Veiculo);
  assert.equal(doSistema.formattedAd, gerado.replace("HILUX CD SRV (aut.)", "Hilux CD SRV 2.7 4X4 (aut.)"));
  assert.equal(doSistema.sellingPrice, 121000);

  // Operador apagou a linha do preco: volta a do sistema.
  const semPreco = await prepararAprovacao({
    ...hilux, formattedAd: "*Hilux*\n2015 | 137.000km", adEditedAt: new Date(),
  } as unknown as Veiculo);
  assert.match(semPreco.formattedAd, /\nPor: \*110\.000,00\*$/);
  assert.equal(semPreco.sellingPrice, 110000);
}

async function main() {
  testarLeituraDaFipe();
  await testarPrecificacao();
  await testarAprovacaoRespeitaOCard();
  console.log("OK — leitura da FIPE e precificacao tem uma implementacao so.");
}

// O pool do Postgres segura o processo vivo: encerra explicitamente.
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
