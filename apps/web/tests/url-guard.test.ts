#!/usr/bin/env tsx
/**
 * Trava da guarda de SSRF.
 *
 * O webhook recebe a URL da foto de um terceiro e o servidor baixa aquilo,
 * servindo o resultado numa rota publica. Sem esta guarda, quem controla o
 * payload le a rede interna da VPS.
 *
 * Uso: pnpm --filter web exec tsx tests/url-guard.test.ts
 */
import assert from "node:assert/strict";
import { ehEnderecoPrivado, verificarUrlExterna } from "../src/lib/url-guard";

// --- enderecos que NUNCA podem ser alcancados ---
const PRIVADOS = [
  "127.0.0.1", // loopback
  "127.9.9.9",
  "0.0.0.0",
  "10.0.0.5", // privada
  "172.16.0.1",
  "172.31.255.255",
  "192.168.1.1",
  "169.254.169.254", // metadados de nuvem: o alvo classico
  "100.64.0.1", // CGNAT
  "224.0.0.1", // multicast
  "255.255.255.255",
  "::1", // loopback v6
  "fc00::1", // unique local
  "fd12:3456::1",
  "fe80::1", // link local
  "::ffff:127.0.0.1", // loopback v4 mapeado em v6
];

for (const ip of PRIVADOS) {
  assert.equal(ehEnderecoPrivado(ip), true, `deveria bloquear ${ip}`);
}

// --- enderecos publicos seguem passando ---
const PUBLICOS = ["8.8.8.8", "1.1.1.1", "172.32.0.1", "192.169.0.1", "2606:4700::1111"];
for (const ip of PUBLICOS) {
  assert.equal(ehEnderecoPrivado(ip), false, `nao deveria bloquear ${ip}`);
}

// --- lixo entra como privado (fail-closed) ---
assert.equal(ehEnderecoPrivado("nao-e-ip"), true, "valor invalido deveria ser recusado");

async function main() {
  const recusa = async (url: string, motivoEsperado?: string) => {
    const r = await verificarUrlExterna(url);
    assert.equal(r.ok, false, `deveria recusar ${url}`);
    if (motivoEsperado && !r.ok) {
      assert.equal(r.motivo, motivoEsperado, `motivo errado para ${url}`);
    }
  };

  // --- protocolo ---
  await recusa("file:///etc/passwd", "protocolo_recusado:file:");
  await recusa("gopher://evil.test/", "protocolo_recusado:gopher:");
  await recusa("nao e uma url", "url_invalida");

  // --- IP literal privado, sem passar por DNS ---
  await recusa("http://127.0.0.1:5432/", "endereco_privado");
  await recusa("http://169.254.169.254/latest/meta-data/", "endereco_privado");
  await recusa("http://[::1]:3000/", "endereco_privado");

  // --- nome que RESOLVE para loopback ---
  await recusa("http://localhost:3000/api/media/x", "endereco_privado");

  // --- host publico literal passa e devolve o endereco a conectar ---
  const ok = await verificarUrlExterna("https://1.1.1.1/imagem.jpg");
  assert.equal(ok.ok, true, "IP publico deveria passar");
  if (ok.ok) {
    assert.equal(ok.endereco, "1.1.1.1");
    assert.equal(ok.familia, 4);
  }

  console.log("OK — guarda de SSRF bloqueia rede interna e deixa passar host publico.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
