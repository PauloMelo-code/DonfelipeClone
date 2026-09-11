#!/usr/bin/env tsx
/**
 * Trava do segundo fator: a parte pura dos codigos de resgate, e as
 * invariantes que sao verificadas LENDO O FONTE.
 *
 * A regra da casa e que toda correcao de seguranca deixa um teste que reprova
 * a regressao "inclusive na rota nova que alguem criar amanha". Regressao de
 * segundo fator nao aparece como erro: aparece como uma rota nova que desliga
 * o fator, ou um SELECT que devolve a semente. Nenhuma das duas quebra teste
 * de comportamento -- por isso estas leem os arquivos.
 *
 * Uso: pnpm --filter web exec tsx tests/segundo-fator.test.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  QUANTIDADE,
  formatar,
  hashDoCodigo,
  normalizar,
  pareceCodigoDeResgate,
} from "../src/lib/codigos-de-resgate";

/** Roda tanto de `apps/web` quanto da raiz do monorepo. */
const RAIZ = [join(process.cwd(), "src"), join(process.cwd(), "apps", "web", "src")].find(
  existsSync,
);
assert.ok(RAIZ, "nao achei a pasta src: rode de apps/web ou da raiz do repo");

function arquivosDeCodigo(pasta: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivosDeCodigo(caminho));
    else if (/\.(ts|tsx)$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

const FONTES = arquivosDeCodigo(RAIZ).map((caminho) => ({
  caminho: relative(RAIZ, caminho).replace(/\\/g, "/"),
  texto: readFileSync(caminho, "utf8"),
}));

assert.ok(FONTES.length > 100, "a varredura precisa mesmo ter lido o projeto");

// ── Codigos de resgate: o que a pessoa digita do papel ────────────────────
{
  // O alfabeto de Crockford existe porque o codigo e transcrito a mao.
  assert.equal(normalizar("o1lu-0abc1"), "011V0ABC1", "O vira 0, I e L viram 1, U vira V");
  assert.equal(normalizar("abcde fghij"), "ABCDEFGH1J", "minuscula, espaco e o L do meio");
  assert.equal(
    hashDoCodigo("abcde-fghij"),
    hashDoCodigo("ABCDE FGHIJ"),
    "as duas transcricoes do mesmo codigo dao o mesmo hash",
  );
  assert.notEqual(hashDoCodigo("ABCDEFGHIJ"), hashDoCodigo("ABCDEFGHIK"));
  assert.equal(hashDoCodigo("ABCDEFGHIJ").length, 64, "sha-256 em hex");

  assert.equal(pareceCodigoDeResgate("ABCDE-FGHIJ"), true);
  assert.equal(pareceCodigoDeResgate("123456"), false, "seis digitos e o aplicativo, nao resgate");
  assert.equal(pareceCodigoDeResgate(""), false);
  assert.equal(pareceCodigoDeResgate("ABCDE-FGHIJK"), false, "comprimento errado nao passa");

  assert.equal(formatar("ABCDEFGHIJ"), "ABCDE-FGHIJ");
  assert.ok(QUANTIDADE >= 8, "poucos codigos demais deixam a conta sem saida cedo");
}

// ── O codigo em claro nunca sai do hash ───────────────────────────────────
{
  // Um erro facil e guardar o codigo formatado num lado e normalizado no
  // outro: a gravacao funciona, o resgate nunca casa, e so descobre quem
  // perdeu o celular.
  const claro = "ABCDEFGHIJ";
  assert.equal(hashDoCodigo(formatar(claro)), hashDoCodigo(claro));
}

// ── Ninguem desliga o segundo fator ───────────────────────────────────────
{
  // Zerar o fator devolve a conta ao CADASTRO PENDENTE, e isso mora em um
  // lugar so. Qualquer outro arquivo apagando `totpEnabledAt` seria o botao
  // de desligar com outro nome.
  const permitidos = new Set(["lib/segundo-fator.ts"]);
  for (const { caminho, texto } of FONTES) {
    if (permitidos.has(caminho)) continue;
    assert.ok(
      !/totpEnabledAt\s*:\s*null/.test(texto),
      `${caminho} apaga totpEnabledAt fora de lib/segundo-fator.ts`,
    );
    assert.ok(
      !/totpSecret\s*:\s*(null|cifrar)/.test(texto),
      `${caminho} grava totpSecret fora de lib/segundo-fator.ts`,
    );
  }
}

// ── A semente nunca volta numa resposta ───────────────────────────────────
{
  // `select()` sem projecao devolve a linha inteira, semente junto. Nas rotas
  // isso vira resposta HTTP com um passo de descuido.
  for (const { caminho, texto } of FONTES) {
    if (!caminho.startsWith("app/api/")) continue;
    assert.ok(
      !/totpSecret/.test(texto) || caminho.includes("/2fa/"),
      `${caminho} menciona totpSecret fora das rotas de fator`,
    );
  }

  const status = FONTES.find((f) => f.caminho === "app/api/me/2fa/route.ts");
  assert.ok(status, "a rota de estado do fator sumiu");
  assert.ok(
    !/totpSecret|codeHash/.test(status.texto),
    "a rota de estado nao pode ler semente nem hash de resgate",
  );
}

// ── O portao vive no funil, nao numa lista de rotas ───────────────────────
{
  const auth = FONTES.find((f) => f.caminho === "lib/auth.ts");
  assert.ok(auth, "lib/auth.ts sumiu");

  assert.ok(
    /conferirSegundoFator/.test(auth.texto),
    "o `authorize` precisa conferir o segundo fator: e o unico funil de sessao",
  );
  assert.ok(
    /precisaCadastrar\(atual\)\s*&&\s*excecao === null/.test(auth.texto),
    "o portao de cadastro pendente saiu de `conferirSessao`",
  );
  assert.ok(
    /registrarFalha\(user\.id\)/.test(auth.texto.split("Segundo fator")[1] ?? ""),
    "codigo errado tem que contar no bloqueio por conta, senao 6 digitos nao tem teto",
  );

  // A excecao ao portao e branca e por chamador: quem precisa dela pede,
  // e toda uma aparece num grep.
  const excecoes = FONTES.filter(
    (f) => f.caminho !== "lib/auth.ts" && /requireSessaoParaCadastrarFator/.test(f.texto),
  ).map((f) => f.caminho);
  for (const caminho of excecoes) {
    assert.ok(
      caminho.startsWith("app/api/me/2fa"),
      `${caminho} usa a excecao do fator sem ser rota de cadastro`,
    );
  }
}

// ── O calculo do codigo continua puro ─────────────────────────────────────
{
  const totp = FONTES.find((f) => f.caminho === "lib/totp.ts");
  assert.ok(totp, "lib/totp.ts sumiu");
  assert.ok(
    !/@\/lib\/db|drizzle-orm|process\.env/.test(totp.texto),
    "lib/totp.ts tem que continuar puro: e o que permite prova-lo contra os vetores da RFC",
  );
}

// ── Nem a trilha nem o log recebem o codigo tentado ───────────────────────
{
  for (const { caminho, texto } of FONTES) {
    if (!caminho.includes("2fa") && caminho !== "lib/segundo-fator.ts") continue;
    // O que pode ir para a trilha e o MEIO (`totp` ou `resgate`), nunca o
    // valor digitado nem a semente.
    assert.ok(
      !/details:\s*\{[^}]*\bcodigo\b/.test(texto),
      `${caminho} manda o codigo tentado para a trilha`,
    );
    assert.ok(
      !/console\.(log|error|warn)\([^)]*\bcodigo\b/.test(texto),
      `${caminho} manda o codigo tentado para o log`,
    );
  }
}

// ── A semente e cifrada em repouso ────────────────────────────────────────
{
  const estado = FONTES.find((f) => f.caminho === "lib/segundo-fator.ts");
  assert.ok(estado, "lib/segundo-fator.ts sumiu");
  assert.ok(
    /cifrar\(segredo, userId\)/.test(estado.texto),
    "a semente tem que ser cifrada e amarrada ao dono antes de ir para o banco",
  );
  assert.ok(
    !/totpSecret:\s*paraBase32|totpSecret:\s*segredo/.test(estado.texto),
    "semente em claro no banco: um dump devolveria segundos fatores funcionando",
  );

  const env = FONTES.find((f) => f.caminho === "lib/env.ts");
  assert.ok(
    env && /TOTP_ENCRYPTION_KEY/.test(env.texto),
    "a chave da cifra tem que ser obrigatoria em producao",
  );
}

console.log("OK — invariantes do segundo fator travadas.");
