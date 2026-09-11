#!/usr/bin/env tsx
/**
 * Trava da checagem de origem.
 *
 * A auditoria de 2026-09-10 mediu o buraco: `POST /api/users` com
 * `Origin: https://evil.example` e cookie valido devolveu 201 e criou a conta.
 * Nao havia UMA checagem de origem no projeto; a unica defesa era o
 * `SameSite=Lax`, que o navegador aplica e que nao cobre navegacao de topo por
 * GET nem subdominio comprometido.
 *
 * Uso: pnpm --filter web exec tsx tests/origem.test.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { conferirOrigem, isentoDeOrigem, origemEsperada } from "../src/lib/origem";

const ANTES = process.env.NEXTAUTH_URL;
process.env.NEXTAUTH_URL = "https://app.donfelipe.com.br";

/** Monta o leitor de cabecalhos que a funcao espera. */
const de = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

// ── A origem certa passa; a de outro site, nao ────────────────────────────
{
  assert.equal(origemEsperada(), "https://app.donfelipe.com.br");

  assert.equal(
    conferirOrigem("POST", de({ origin: "https://app.donfelipe.com.br" })).ok,
    true,
    "a propria origem passa",
  );
  assert.equal(
    conferirOrigem("POST", de({ origin: "https://evil.example" })).ok,
    false,
    "o site de outro nao passa -- e o caso exato que a auditoria mediu",
  );
  // Prefixo e sufixo nao contam como igual.
  for (const falsa of [
    "https://app.donfelipe.com.br.evil.example",
    "https://evil.example/app.donfelipe.com.br",
    "http://app.donfelipe.com.br",
    "https://app.donfelipe.com.br:8443",
    "https://sub.app.donfelipe.com.br",
  ]) {
    assert.equal(
      conferirOrigem("POST", de({ origin: falsa })).ok,
      false,
      `origem parecida aceita: ${falsa}`,
    );
  }
}

// ── Sem `Origin`, vale o `Sec-Fetch-Site` ─────────────────────────────────
{
  assert.equal(conferirOrigem("POST", de({ "sec-fetch-site": "same-origin" })).ok, true);
  assert.equal(
    conferirOrigem("POST", de({ "sec-fetch-site": "none" })).ok,
    true,
    "`none` e a barra de enderecos: nao ha site de terceiro no meio",
  );
  assert.equal(conferirOrigem("POST", de({ "sec-fetch-site": "cross-site" })).ok, false);
  assert.equal(conferirOrigem("POST", de({ "sec-fetch-site": "same-site" })).ok, false, "subdominio nao vale");
}

// ── Nenhum dos dois: RECUSA ───────────────────────────────────────────────
{
  // Um navegador sempre manda pelo menos um. Quem nao manda e cliente
  // programatico, e cliente programatico com cookie e o que nao queremos.
  const v = conferirOrigem("POST", de({}));
  assert.equal(v.ok, false);
  assert.equal(v.ok === false && v.motivo, "sem_origem");
}

// ── Sem configuracao, nada passa ──────────────────────────────────────────
{
  process.env.NEXTAUTH_URL = "";
  assert.equal(origemEsperada(), null);
  assert.equal(
    conferirOrigem("POST", de({ origin: "https://app.donfelipe.com.br" })).ok,
    false,
    "sem origem configurada nao ha com o que comparar: recusa, nunca adivinha",
  );
  process.env.NEXTAUTH_URL = "https://app.donfelipe.com.br";
}

// ── Leitura nao e mutacao ─────────────────────────────────────────────────
{
  for (const metodo of ["GET", "HEAD", "get", "head"]) {
    assert.equal(
      conferirOrigem(metodo, de({ origin: "https://evil.example" })).ok,
      true,
      `${metodo} nao muda estado e nao e barrado aqui`,
    );
  }
  for (const metodo of ["POST", "PUT", "PATCH", "DELETE", "post", "delete"]) {
    assert.equal(
      conferirOrigem(metodo, de({ origin: "https://evil.example" })).ok,
      false,
      `${metodo} muda estado e tem que ser barrado`,
    );
  }
}

// ── As isencoes sao caminho exato ou prefixo com barra ────────────────────
{
  assert.equal(isentoDeOrigem("/api/auth/callback/credentials"), true);
  assert.equal(isentoDeOrigem("/api/webhook/whatsapp"), true);
  assert.equal(isentoDeOrigem("/api/whatsapp/health-monitor"), true);
  assert.equal(isentoDeOrigem("/api/users"), false);
  assert.equal(isentoDeOrigem("/api/me/password"), false);
  // O vizinho de nome parecido NAO herda a isencao.
  assert.equal(
    isentoDeOrigem("/api/authorizacao-falsa"),
    false,
    "prefixo solto liberaria a rota que so comeca igual",
  );
  assert.equal(isentoDeOrigem("/api/whatsapp/qr"), false, "so o health-monitor, nao a familia");
}

// ── A borda chama a funcao, e nenhum GET escreve ──────────────────────────
{
  const RAIZ = [join(process.cwd(), "src"), join(process.cwd(), "apps", "web", "src")].find(
    existsSync,
  );
  assert.ok(RAIZ, "nao achei a pasta src");

  const middleware = readFileSync(join(RAIZ, "middleware.ts"), "utf8");
  assert.ok(
    /conferirOrigem\(request\.method, request\.headers\)/.test(middleware),
    "a borda tem que conferir a origem de toda requisicao mutante",
  );
  assert.ok(
    !/pathname\.startsWith\("\/api\/media"\)/.test(middleware),
    "/api/media saiu da lista publica: a foto agora exige sessao",
  );
  assert.ok(
    /\/api\/whatsapp\/health-monitor/.test(middleware),
    "a rota de monitoria entrou na lista, so ela",
  );
  assert.ok(
    !/"\/api\/whatsapp"/.test(middleware),
    "e a familia /api/whatsapp NAO foi liberada inteira",
  );

  // Nenhum handler GET pode escrever: `SameSite=Lax` manda cookie em
  // navegacao de topo, entao GET que escreve e clicavel por link.
  const arquivos = (pasta: string): string[] => {
    const saida: string[] = [];
    for (const nome of readdirSync(pasta)) {
      const caminho = join(pasta, nome);
      if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho));
      else if (nome === "route.ts") saida.push(caminho);
    }
    return saida;
  };
  for (const caminho of arquivos(join(RAIZ, "app", "api"))) {
    const texto = readFileSync(caminho, "utf8");
    const bloco = texto.split(/export async function GET/)[1];
    if (!bloco) continue;
    const ateOProximoHandler = bloco.split(/export async function (POST|PUT|PATCH|DELETE)/)[0];
    assert.ok(
      !/\b(db|tx)\.(insert|update|delete)\(/.test(ateOProximoHandler),
      `${relative(RAIZ, caminho)} escreve dentro de um handler GET`,
    );
  }
}

if (ANTES === undefined) delete process.env.NEXTAUTH_URL;
else process.env.NEXTAUTH_URL = ANTES;

console.log("OK — checagem de origem travada.");
