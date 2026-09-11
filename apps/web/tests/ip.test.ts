#!/usr/bin/env tsx
/**
 * Trava da leitura de IP.
 *
 * Este e o teste que faltava quando o limitador por IP virou enfeite: a
 * implementacao pegava o PRIMEIRO valor do `x-forwarded-for`, que e o pedaco
 * que o cliente escreve. Nada quebrava -- o login entrava, o contador subia --
 * e mesmo assim bastava rodar o cabecalho para nunca esbarrar no teto.
 *
 * O que vale e contado de TRAS para frente, pulando os proxies que nos mesmos
 * rodamos.
 *
 * Uso: pnpm --filter web exec tsx tests/ip.test.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { lerIp, metaDeCabecalhos, type LeitorDeCabecalho } from "../src/lib/request-meta";

/** Monta um leitor a partir de um objeto simples de cabecalhos. */
const de = (cabecalhos: Record<string, string>): LeitorDeCabecalho => (n) => cabecalhos[n];

// ── O que o cliente escreve nao vale ──────────────────────────────────────
{
  // Um proxy nosso na frente: ele ANEXA o que enxergou no fim da lista.
  const forjado = de({ "x-forwarded-for": "9.9.9.9, 200.1.2.3" });
  assert.equal(
    lerIp(forjado, 1),
    "200.1.2.3",
    "com um proxy, o ultimo da lista e o que ele enxergou",
  );

  // Dois proxies: o penultimo e o cliente de verdade.
  const doisSaltos = de({ "x-forwarded-for": "9.9.9.9, 200.1.2.3, 10.0.0.7" });
  assert.equal(lerIp(doisSaltos, 2), "200.1.2.3", "com dois proxies, pula os dois");

  // Sem forjar nada, o resultado e o mesmo.
  assert.equal(lerIp(de({ "x-forwarded-for": "200.1.2.3" }), 1), "200.1.2.3");
}

// ── O ataque que motivou tudo: rodar o cabecalho ──────────────────────────
{
  // Mil valores inventados na frente, e o proxy anexando sempre o mesmo real.
  const vistos = new Set<string | null>();
  for (let i = 0; i < 1000; i++) {
    const inventado = `${i % 256}.${(i * 7) % 256}.${(i * 13) % 256}.${(i * 31) % 256}`;
    vistos.add(lerIp(de({ "x-forwarded-for": `${inventado}, 200.1.2.3` }), 1));
  }
  assert.deepEqual(
    [...vistos],
    ["200.1.2.3"],
    "mil cabecalhos diferentes tem que dar UMA chave de limitador",
  );
}

// ── Cadeia mais curta que o esperado nao vale ─────────────────────────────
{
  // Configurado para dois proxies, mas chegou com um so: alguem entrou por um
  // caminho que nao e o nosso.
  assert.equal(
    lerIp(de({ "x-forwarded-for": "200.1.2.3" }), 2),
    null,
    "cadeia curta demais e recusada, nao remendada",
  );
  assert.equal(lerIp(de({}), 1), null, "sem cabecalho nenhum, nulo");
}

// ── Sem proxy configurado, nada e confiavel ───────────────────────────────
{
  const comTudo = de({
    "x-forwarded-for": "200.1.2.3",
    "x-real-ip": "200.1.2.4",
    "cf-connecting-ip": "200.1.2.5",
  });
  assert.equal(
    lerIp(comTudo, 0),
    null,
    "sem ninguem no caminho para escrever a verdade, todo cabecalho e do cliente",
  );
}

// ── Lixo nao vira chave de limitador nem linha de auditoria ───────────────
{
  for (const lixo of [
    "nao-sou-um-ip",
    "999.1.1.1",
    "1.2.3",
    "<script>alert(1)</script>",
    "'; drop table users; --",
    "",
    "   ",
  ]) {
    assert.equal(
      lerIp(de({ "x-forwarded-for": lixo }), 1),
      null,
      `valor invalido aceito: ${JSON.stringify(lixo)}`,
    );
  }
  // E o valor invalido nao contamina o resto da lista.
  assert.equal(lerIp(de({ "x-forwarded-for": "1.2.3.4, lixo" }), 1), null);
}

// ── Porta e colchetes saem, senao viram chaves diferentes ─────────────────
{
  assert.equal(lerIp(de({ "x-forwarded-for": "200.1.2.3:54321" }), 1), "200.1.2.3");
  assert.equal(lerIp(de({ "x-forwarded-for": "[2001:db8::1]:443" }), 1), "2001:db8::1");
  assert.equal(lerIp(de({ "x-forwarded-for": "2001:db8::1" }), 1), "2001:db8::1");
  assert.equal(
    lerIp(de({ "x-forwarded-for": "200.1.2.3:1111" }), 1),
    lerIp(de({ "x-forwarded-for": "200.1.2.3" }), 1),
    "o mesmo cliente com e sem porta tem que dar a mesma chave",
  );
}

// ── Os cabecalhos que o proxy SOBRESCREVE servem de reserva ───────────────
{
  assert.equal(
    lerIp(de({ "cf-connecting-ip": "200.1.2.3" }), 1),
    "200.1.2.3",
    "sem x-forwarded-for, o cabecalho do Cloudflare vale",
  );
  assert.equal(lerIp(de({ "x-real-ip": "200.1.2.3" }), 1), "200.1.2.3");
  assert.equal(
    lerIp(de({ "x-forwarded-for": "9.9.9.9, 200.1.2.3", "x-real-ip": "1.1.1.1" }), 1),
    "200.1.2.3",
    "a cadeia tem precedencia sobre a reserva",
  );
}

// ── A porta do next-auth le os mesmos cabecalhos ──────────────────────────
{
  // O `authorize` recebe um objeto simples, e nao um `Request`. Se esta porta
  // divergir, o funil de login volta a ter a copia dele.
  const meta = metaDeCabecalhos({
    "x-forwarded-for": "9.9.9.9, 200.1.2.3",
    "user-agent": "Mozilla/5.0",
  });
  assert.equal(meta.ipAddress, "200.1.2.3", "mesma leitura, mesmo resultado");
  assert.equal(meta.userAgent, "Mozilla/5.0");

  // Alguns servidores entregam o cabecalho repetido como lista.
  assert.equal(
    metaDeCabecalhos({ "x-forwarded-for": ["9.9.9.9, 200.1.2.3"] }).ipAddress,
    "200.1.2.3",
  );
  assert.equal(metaDeCabecalhos(undefined).ipAddress, null, "sem cabecalhos, nulo");
}

// ── Uma implementacao, e so uma ───────────────────────────────────────────
{
  const RAIZ = [join(process.cwd(), "src"), join(process.cwd(), "apps", "web", "src")].find(
    existsSync,
  );
  assert.ok(RAIZ, "nao achei a pasta src: rode de apps/web ou da raiz do repo");

  const arquivos = (pasta: string): string[] => {
    const saida: string[] = [];
    for (const nome of readdirSync(pasta)) {
      const caminho = join(pasta, nome);
      if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho));
      else if (/\.(ts|tsx)$/.test(nome)) saida.push(caminho);
    }
    return saida;
  };

  for (const caminho of arquivos(RAIZ)) {
    const relativo = relative(RAIZ, caminho).replace(/\\/g, "/");
    if (relativo === "lib/request-meta.ts") continue;
    // Sem comentarios: eles EXPLICAM o defeito antigo, e a explicacao casaria
    // com a propria busca.
    const codigo = readFileSync(caminho, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
    assert.ok(
      !/x-forwarded-for|x-real-ip|cf-connecting-ip/i.test(codigo),
      `${relativo} le cabecalho de origem por conta propria; use lib/request-meta`,
    );
  }
}

console.log("OK — leitura de IP travada.");
