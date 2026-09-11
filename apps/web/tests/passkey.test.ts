#!/usr/bin/env tsx
/**
 * Trava das invariantes da passkey, verificadas LENDO O FONTE.
 *
 * Uma regressao de WebAuthn nao quebra teste de comportamento: o login continua
 * entrando enquanto passa a aceitar o que nao devia. Deduzir o dominio do
 * cabecalho `Host`, deixar de exigir verificacao do dono, reaproveitar desafio
 * -- os tres deixam a tela funcionando igual. Por isso estas leem os arquivos.
 *
 * Uso: pnpm --filter web exec tsx tests/passkey.test.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

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

const ler = (caminho: string) => {
  const f = FONTES.find((x) => x.caminho === caminho);
  assert.ok(f, `${caminho} sumiu`);
  return f.texto;
};

const passkey = ler("lib/passkey.ts");

// ── O dominio vem da configuracao, nunca da requisicao ────────────────────
{
  // Deduzir o `rpID` do cabecalho `Host` devolveria ao atacante exatamente o
  // que a passkey existe para tirar dele: a amarracao ao dominio.
  assert.ok(
    /process\.env\.NEXTAUTH_URL/.test(passkey),
    "o dominio da passkey tem que sair do ambiente",
  );
  assert.ok(
    !/req\.|request\.|headers\b|x-forwarded-host|host['"]\]/i.test(
      passkey.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ""),
    ),
    "lib/passkey.ts nao pode olhar a requisicao para decidir dominio ou origem",
  );
  assert.ok(
    /expectedRPID: rpID/.test(passkey) && /expectedOrigin: origem/.test(passkey),
    "as duas conferencias precisam amarrar dominio E origem",
  );
}

// ── Verificacao do dono exigida NO SERVIDOR ───────────────────────────────
{
  // O sinalizador UV vem dentro dos dados assinados. Pedir no desafio e so um
  // pedido; um autenticador que ignore devolveria presenca sem biometria.
  const exigencias = passkey.match(/requireUserVerification:\s*true/g) ?? [];
  assert.equal(
    exigencias.length,
    2,
    "cadastro E login precisam exigir verificacao do dono no servidor",
  );
  assert.ok(
    !/requireUserVerification:\s*false/.test(passkey),
    "nenhuma conferencia pode dispensar a verificacao do dono",
  );
  assert.ok(
    /userVerification:\s*"required"/.test(passkey),
    "e o pedido ao navegador tambem exige",
  );
  assert.ok(
    /residentKey:\s*"required"/.test(passkey),
    "credencial descobrivel: e o que permite o login nao pedir e-mail",
  );
}

// ── Desafio de uso unico, com validade ────────────────────────────────────
{
  assert.ok(
    /isNull\(desafiosWebauthn\.usedAt\)/.test(passkey),
    "o consumo do desafio precisa ter `used_at IS NULL` no WHERE, senao nao e atomico",
  );
  assert.ok(
    /expiresAt\} > now\(\)/.test(passkey),
    "desafio vencido nao pode ser aceito",
  );
  assert.ok(
    /\.update\(desafiosWebauthn\)/.test(passkey),
    "o desafio e gasto por UPDATE condicional, nunca por leitura seguida de escrita",
  );

  // O desafio conferido e o que o navegador ASSINOU, lido do clientDataJSON.
  assert.ok(
    /lerDesafioDoCliente\(resposta\?\.response\?\.clientDataJSON\)/.test(passkey),
    "o desafio tem que sair dos dados assinados, nunca de um campo solto do corpo",
  );
}

// ── O login por passkey nao enumera conta ─────────────────────────────────
{
  const rota = ler("app/api/auth/passkey/desafio/route.ts");
  assert.ok(
    !/email/i.test(rota.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")),
    "a rota publica de desafio nao pode receber e-mail: lista vazia contra cheia enumera conta",
  );
  assert.ok(
    !/allowCredentials/.test(passkey),
    "sem lista de credenciais no login, pelo mesmo motivo",
  );
}

// ── Mexer em credencial exige provar o fator atual ────────────────────────
{
  for (const caminho of ["app/api/me/passkey/desafio/route.ts", "app/api/me/passkey/[id]/route.ts"]) {
    assert.ok(
      /provarFatorAtual\(auth\.user\.id, codigo\)/.test(ler(caminho)),
      `${caminho} tem que exigir o fator atual antes de mexer em credencial`,
    );
  }
  // E nenhuma delas aceita alvo pelo corpo: o alvo e a sessao.
  for (const { caminho, texto } of FONTES) {
    if (!caminho.startsWith("app/api/me/")) continue;
    assert.ok(
      !/\buserId\b\s*[,}]/.test(texto.replace(/auth\.user\.id/g, "")),
      `${caminho} parece aceitar userId: a tela de perfil mira a sessao corrente`,
    );
  }
}

// ── A passkey entra pelo MESMO funil de sessao ────────────────────────────
{
  const auth = ler("lib/auth.ts");
  assert.ok(
    /entrarPorPasskey\(inicio, assinatura, origem\)/.test(auth),
    "o caminho da passkey tem que ser chamado de dentro do `authorize`",
  );
  const trecho = ler("lib/login/entrada-por-passkey.ts");
  assert.ok(/estaTravada\(user\)/.test(trecho), "conta travada barra tambem por passkey");
  assert.ok(/user\.active/.test(trecho), "conta desativada barra tambem por passkey");
  assert.ok(/registrarEntrada\(/.test(trecho), "a entrada por passkey entra na trilha");
  assert.ok(/recusar\(inicio/.test(trecho), "a recusa passa pelo mesmo piso de tempo");

  // O limitador por IP roda ANTES do desvio, senao a passkey escaparia dele.
  const antesDoDesvio = auth.split("const assinatura = credentials?.passkey")[0];
  assert.ok(
    /rateLimit\(LOGIN_LIMITER,/.test(antesDoDesvio),
    "o teto por IP tem que valer para a passkey tambem",
  );
  assert.ok(
    /metaDeCabecalhos\(req\?\.headers\)/.test(antesDoDesvio),
    "e a origem tem que sair da leitura canonica, nao de uma copia local",
  );
}

// ── Nada de chave, desafio ou credencial voltando pela listagem ───────────
{
  const lista = ler("app/api/me/passkey/route.ts");
  assert.ok(
    !/publicKey|credentialId|challenge/.test(lista),
    "a listagem devolve apelido e datas, nada de credencial",
  );
  assert.ok(
    !/publicKey|credentialId/.test(ler("app/(dashboard)/seguranca/_componentes/cartao-de-passkeys.tsx")),
    "a tela tambem nao precisa da credencial",
  );
}

// ── A tela de seguranca nao tem o que a regua proibe ──────────────────────
{
  const tela = [
    "app/(dashboard)/seguranca/page.tsx",
    "app/(dashboard)/seguranca/_componentes/cartao-do-fator.tsx",
    "app/(dashboard)/seguranca/_componentes/cartao-de-passkeys.tsx",
    "app/(dashboard)/seguranca/_componentes/cartao-de-senha.tsx",
  ]
    .map(ler)
    .join("\n")
    // Sem os comentarios: eles EXPLICAM que nao existe desligar, e a
    // explicacao casaria com a propria busca.
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");

  assert.ok(
    !/desligar o segundo fator|desativar o fator|remover o segundo fator/i.test(tela),
    "nao existe desligar o segundo fator",
  );
  // Codigos de resgate so aparecem quando SAO GERADOS, nunca ao carregar.
  assert.ok(
    !/codigosRestantes\.map|codigos\.map/.test(tela),
    "a tela nao pode listar os codigos de resgate vindos de uma leitura",
  );
  assert.ok(
    /novos\.map/.test(tela),
    "os codigos so aparecem os recem-gerados, uma vez",
  );
}

console.log("OK — invariantes da passkey travadas.");
