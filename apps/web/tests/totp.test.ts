#!/usr/bin/env tsx
/**
 * Trava do segundo fator contra a NORMA, nao contra a minha leitura dela.
 *
 * Rodam aqui os vetores publicados na RFC 4226 (apendice D, HOTP) e na RFC
 * 6238 (apendice B, TOTP nos tres algoritmos). Foi o que justificou escrever
 * o TOTP em vez de instalar: uma implementacao que reproduz os vetores da
 * norma esta certa, e nenhuma dependencia traria essa prova junto.
 *
 * Uso: pnpm --filter web exec tsx tests/totp.test.ts
 */
import assert from "node:assert/strict";
import {
  DIGITOS,
  PASSO_SEGUNDOS,
  TOLERANCIA_DE_PASSOS,
  codigoNoPasso,
  conferirCodigo,
  deBase32,
  gerarSegredo,
  paraBase32,
  passoDoInstante,
  uriDeProvisionamento,
} from "../src/lib/totp";

// ── RFC 4226, apendice D: HOTP, segredo ASCII, contadores 0 a 9 ───────────
{
  const segredo = Buffer.from("12345678901234567890", "ascii");
  const esperados = [
    "755224", "287082", "359152", "969429", "338314",
    "254676", "287922", "162583", "399871", "520489",
  ];
  esperados.forEach((esperado, contador) => {
    assert.equal(
      codigoNoPasso(segredo, contador, 6, "sha1"),
      esperado,
      `RFC 4226 contador ${contador}`,
    );
  });
}

// ── RFC 6238, apendice B: TOTP de 8 digitos nos tres algoritmos ───────────
{
  const segredos = {
    sha1: Buffer.from("12345678901234567890", "ascii"),
    sha256: Buffer.from("12345678901234567890123456789012", "ascii"),
    sha512: Buffer.from(
      "1234567890123456789012345678901234567890123456789012345678901234",
      "ascii",
    ),
  } as const;

  const vetores: [number, "sha1" | "sha256" | "sha512", string][] = [
    [59, "sha1", "94287082"],
    [59, "sha256", "46119246"],
    [59, "sha512", "90693936"],
    [1111111109, "sha1", "07081804"],
    [1111111109, "sha256", "68084774"],
    [1111111109, "sha512", "25091201"],
    [1111111111, "sha1", "14050471"],
    [1111111111, "sha256", "67062674"],
    [1111111111, "sha512", "99943326"],
    [1234567890, "sha1", "89005924"],
    [1234567890, "sha256", "91819424"],
    [1234567890, "sha512", "93441116"],
    [2000000000, "sha1", "69279037"],
    [2000000000, "sha256", "90698825"],
    [2000000000, "sha512", "38618901"],
    [20000000000, "sha1", "65353130"],
    [20000000000, "sha256", "77737706"],
    [20000000000, "sha512", "47863826"],
  ];

  for (const [segundos, algoritmo, esperado] of vetores) {
    const passo = passoDoInstante(new Date(segundos * 1000));
    assert.equal(
      codigoNoPasso(segredos[algoritmo], passo, 8, algoritmo),
      esperado,
      `RFC 6238 t=${segundos} ${algoritmo}`,
    );
  }
}

// ── Base32 vai e volta ────────────────────────────────────────────────────
{
  // RFC 4648, apendice: os vetores de teste da propria norma do base32.
  assert.equal(paraBase32(Buffer.from("f")), "MY======".replace(/=+$/, ""));
  assert.equal(paraBase32(Buffer.from("foobar")), "MZXW6YTBOI".replace(/=+$/, ""));
  assert.equal(deBase32("MZXW6YTBOI").toString(), "foobar");

  // O usuario digita a chave a mao quando o aplicativo nao le o QR.
  assert.equal(deBase32("mzxw 6ytb-oi").toString(), "foobar", "tolera minuscula, espaco e hifen");
  assert.throws(() => deBase32("MZXW0YTB"), /base32/, "caractere fora do alfabeto e erro, nao zero");

  for (let i = 0; i < 200; i++) {
    const bytes = gerarSegredo();
    assert.deepEqual(deBase32(paraBase32(bytes)), bytes, "ida e volta preserva os bytes");
  }
}

// ── A janela de tolerancia ────────────────────────────────────────────────
{
  const segredo = gerarSegredo();
  const agora = new Date("2026-09-10T12:00:00.000Z");
  const passo = passoDoInstante(agora);

  assert.equal(conferirCodigo(segredo, codigoNoPasso(segredo, passo), { agora }).ok, true);
  assert.equal(
    conferirCodigo(segredo, codigoNoPasso(segredo, passo - 1), { agora }).ok,
    true,
    "o passo anterior entra: relogio do celular atrasado",
  );
  assert.equal(
    conferirCodigo(segredo, codigoNoPasso(segredo, passo + 1), { agora }).ok,
    true,
    "o passo seguinte entra: relogio adiantado",
  );
  assert.equal(
    conferirCodigo(segredo, codigoNoPasso(segredo, passo - TOLERANCIA_DE_PASSOS - 1), { agora }).ok,
    false,
    "fora da janela nao entra",
  );
  assert.equal(
    conferirCodigo(segredo, codigoNoPasso(segredo, passo + TOLERANCIA_DE_PASSOS + 1), { agora }).ok,
    false,
    "fora da janela do outro lado tambem nao",
  );
}

// ── Reuso: o mesmo codigo nao serve duas vezes ────────────────────────────
{
  const segredo = gerarSegredo();
  const agora = new Date("2026-09-10T12:00:00.000Z");
  const passo = passoDoInstante(agora);
  const codigo = codigoNoPasso(segredo, passo);

  const primeira = conferirCodigo(segredo, codigo, { agora });
  assert.equal(primeira.ok, true);
  assert.equal(primeira.passo, passo, "devolve o passo para quem chama guardar");

  const segunda = conferirCodigo(segredo, codigo, { agora, passoMinimo: primeira.passo! + 1 });
  assert.equal(segunda.ok, false, "o mesmo codigo recusado na segunda vez");

  // E o passo seguinte continua entrando: a trava barra reuso, nao a conta.
  assert.equal(
    conferirCodigo(segredo, codigoNoPasso(segredo, passo + 1), {
      agora,
      passoMinimo: primeira.passo! + 1,
    }).ok,
    true,
  );
}

// ── Entrada malformada nunca vira acerto ──────────────────────────────────
{
  const segredo = gerarSegredo();
  const agora = new Date("2026-09-10T12:00:00.000Z");
  for (const lixo of ["", "12345", "1234567", "abcdef", "12 34 56", "  ", "000000e0"]) {
    const veredicto = conferirCodigo(segredo, lixo, { agora });
    if (veredicto.ok) {
      // So passa se por acaso for mesmo o codigo do passo -- o que nao ocorre
      // para nenhum destes formatos.
      assert.fail(`entrada malformada aceita: ${JSON.stringify(lixo)}`);
    }
  }
  // @ts-expect-error prova que undefined nao explode nem vira acerto
  assert.equal(conferirCodigo(segredo, undefined, { agora }).ok, false);
}

// ── Chute cego: a chance e a da norma, nao maior ──────────────────────────
{
  const segredo = gerarSegredo();
  const agora = new Date("2026-09-10T12:00:00.000Z");
  let acertos = 0;
  for (let i = 0; i < 20000; i++) {
    const chute = String(Math.floor(Math.random() * 10 ** DIGITOS)).padStart(DIGITOS, "0");
    if (conferirCodigo(segredo, chute, { agora }).ok) acertos++;
  }
  // 3 passos aceitos em 10^6 possibilidades: o esperado em 20 mil chutes e
  // 0,06. Mais que 3 significaria janela larga demais ou truncamento errado.
  assert.ok(acertos <= 3, `chutes cegos aceitos demais: ${acertos}`);
}

// ── A URI que o QR carrega ────────────────────────────────────────────────
{
  const segredo = deBase32("MZXW6YTBOI");
  const uri = uriDeProvisionamento(segredo, "paulo@exemplo.test", "Don Felipe");
  assert.ok(uri.startsWith("otpauth://totp/"), "esquema que o aplicativo reconhece");
  assert.ok(uri.includes("secret=MZXW6YTBOI"), "leva o segredo em base32");
  assert.ok(uri.includes("issuer=Don+Felipe"), "leva o emissor, senao a lista fica ambigua");
  assert.ok(uri.includes(`period=${PASSO_SEGUNDOS}`) && uri.includes(`digits=${DIGITOS}`));
  assert.ok(
    uri.includes(encodeURIComponent("Don Felipe:paulo@exemplo.test")),
    "o rotulo separa emissor e conta",
  );
}

console.log("OK — TOTP bate com os vetores da RFC 4226 e da RFC 6238.");
