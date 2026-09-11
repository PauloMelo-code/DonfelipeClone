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
import { extrairFipeDoTexto, precificar } from "../src/lib/actions/veiculos";

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

async function main() {
  testarLeituraDaFipe();
  await testarPrecificacao();
  console.log("OK — leitura da FIPE e precificacao tem uma implementacao so.");
}

// O pool do Postgres segura o processo vivo: encerra explicitamente.
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
