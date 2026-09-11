#!/usr/bin/env tsx
/**
 * Trava da sessao no banco, verificada LENDO O FONTE.
 *
 * A regressao aqui e silenciosa: voltar a confiar no token deixa tudo
 * funcionando -- login entra, painel abre -- e so nao funciona a unica coisa
 * que importa, que e encerrar. Nenhum teste de comportamento pega isso.
 *
 * Uso: pnpm --filter web exec tsx tests/sessoes.test.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { HORAS_DE_VIDA, MINUTOS_DE_INATIVIDADE } from "../src/lib/sessoes";

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

const sessoes = ler("lib/sessoes.ts");
const auth = ler("lib/auth.ts");

// ── Os prazos sao coerentes entre si ──────────────────────────────────────
{
  assert.ok(HORAS_DE_VIDA <= 24, "a regua poe teto de 24 h na vida da sessao");
  assert.ok(MINUTOS_DE_INATIVIDADE <= 60, "e de 60 minutos no silencio");
  assert.ok(
    MINUTOS_DE_INATIVIDADE < HORAS_DE_VIDA * 60,
    "inatividade maior que o teto seria letra morta",
  );
}

// ── Os tres prazos sao avaliados pelo relogio do BANCO ────────────────────
{
  // Em memoria, dois servidores com relogios diferentes discordariam sobre
  // quando a sessao acaba.
  for (const [trecho, oQue] of [
    ["isNull(sessoes.revokedAt)", "sessao revogada nao vale"],
    ["expiresAt} > now()", "teto absoluto de vida"],
    ["lastSeenAt} > now() -", "expiracao por inatividade"],
  ] as const) {
    assert.ok(sessoes.includes(trecho), `falta a checagem: ${oQue}`);
  }
  assert.ok(
    !/Date\.now\(\)|new Date\(\)/.test(sessoes),
    "os prazos nao podem ser decididos pelo relogio do processo",
  );
}

// ── A autoridade saiu do token ────────────────────────────────────────────
{
  assert.ok(
    /carregarSessao\(sessaoId\)/.test(auth),
    "a guarda tem que carregar a sessao do banco",
  );
  // O que o token pode dizer e QUAL sessao; nunca se ela vale, nem qual papel.
  const guarda = auth.split("async function conferirSessao")[1] ?? "";
  assert.ok(
    !/daSessao\.role|token\.role/.test(guarda),
    "papel lido do token valeria por mais um dia depois de mudar",
  );
  assert.ok(
    /sid/.test(guarda),
    "a guarda le o ponteiro da sessao que veio no token",
  );
}

// ── Um controle, uma implementacao ────────────────────────────────────────
{
  // A `session_epoch` era o substituto pobre da revogacao. Com a linha no
  // banco, manter as duas garantiria que a proxima correcao chegasse so numa.
  for (const { caminho, texto } of FONTES) {
    assert.ok(
      !/sessionEpoch|session_epoch/.test(texto),
      `${caminho} ainda menciona a geracao de sessao, que foi substituida pela revogacao`,
    );
  }
}

// ── Encerrar e sempre escopado ao dono ────────────────────────────────────
{
  assert.ok(
    /eq\(sessoes\.userId, userId\)/.test(sessoes),
    "revogar sem filtrar pelo dono derrubaria a sessao de qualquer um",
  );
  assert.ok(
    /isNull\(sessoes\.revokedAt\)/.test(sessoes),
    "revogar duas vezes nao pode reescrever o motivo original",
  );

  const rota = ler("app/api/me/sessions/[id]/route.ts");
  assert.ok(
    /revogar\(id, auth\.user\.id,/.test(rota),
    "a rota passa o dono da sessao corrente, nunca um id do corpo",
  );
  for (const caminho of ["app/api/me/sessions/route.ts", "app/api/me/sessions/[id]/route.ts"]) {
    assert.ok(
      /requireAuth\(\)/.test(ler(caminho)),
      `${caminho} sem guarda de autenticacao`,
    );
  }
}

// ── Sair encerra a linha, e nao so o cookie ───────────────────────────────
{
  assert.ok(
    /events:\s*\{[\s\S]*?signOut/.test(auth),
    "sem o evento de saida, sair apagaria o cookie e deixaria a sessao viva",
  );
  assert.ok(
    /revogar\(sid, userId, "logout"\)/.test(auth),
    "e o evento precisa revogar de verdade",
  );
  assert.ok(/registrarSaida\(/.test(auth), "logout tem que entrar na trilha");
}

// ── O cookie nao pode viver mais que a linha ──────────────────────────────
{
  assert.ok(
    /maxAge: HORAS_DE_VIDA \* 60 \* 60/.test(auth),
    "o vencimento do cookie tem que sair da mesma constante do teto no banco",
  );
}

// ── Toda troca de fator derruba as sessoes ────────────────────────────────
{
  const fator = ler("lib/segundo-fator.ts");
  const revogacoes = fator.match(/revogarTodasDe\(/g) ?? [];
  assert.equal(
    revogacoes.length,
    3,
    "ligar, girar e zerar o fator: os tres tem que derrubar as sessoes",
  );
}

// ── E as outras tres situacoes que a auditoria pegou abertas ───────────────
{
  // A revogacao existia, mas so estava pendurada na troca de FATOR. A
  // auditoria de 2026-09-10 mediu as tres que faltavam: trocar a propria
  // senha deixava a outra aba respondendo 200; reset por admin deixava a
  // linha viva; e desativar a conta nao revogava nada -- reativar
  // ressuscitava o cookie de quem tinha saido da empresa.
  const senhaPropria = ler("app/api/me/password/route.ts");
  assert.ok(
    /revogarTodasDe\(auth\.user\.id, "senha-trocada", \{[\s\S]{0,60}exceto: auth\.sessaoId/.test(
      senhaPropria,
    ),
    "trocar a propria senha derruba as OUTRAS sessoes, mantendo a de quem pediu",
  );

  const admin = ler("app/api/users/[id]/route.ts");
  assert.ok(
    /revogarTodasDe\(id, desativou \? "conta-desativada" : "senha-trocada"/.test(admin),
    "desativar e redefinir senha pela rota administrativa derrubam as sessoes do alvo",
  );
  // A ULTIMA ocorrencia e a chamada; a primeira e o `import`.
  const pedacos = admin.split("revogarTodasDe");
  assert.ok(
    /executor: tx/.test(pedacos[pedacos.length - 1] ?? ""),
    "e na MESMA transacao do efeito, senao a revogacao sobrevive a um rollback",
  );
}

// ── Nada de token de sessao em resposta ───────────────────────────────────
{
  // O que a listagem devolve e o id da LINHA, que sem o cookie assinado nao
  // abre nada. O token em si nunca sai do cookie.
  const lista = ler("app/api/me/sessions/route.ts");
  assert.ok(
    !/token|jwt|secret/i.test(lista.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")),
    "a rota de sessoes nao pode tocar em token",
  );
  const cartao = ler("app/(dashboard)/seguranca/_componentes/cartao-de-sessoes.tsx");
  assert.ok(
    !/localStorage|sessionStorage|document\.cookie/.test(cartao),
    "a tela nao guarda nada de sessao no navegador",
  );
}

console.log("OK — sessao no banco travada.");
