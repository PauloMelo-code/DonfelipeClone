#!/usr/bin/env tsx
/**
 * Trava das guardas da administração de contas.
 *
 * Cada caso aqui é um defeito que foi REPRODUZIDO ao vivo na auditoria de
 * 2026-09-10, com requisição e resposta registradas no relatório. O teste
 * existe para que nenhum deles volte em silêncio.
 *
 *   REQ-H3  o último administrador se auto-rebaixou e sobraram ZERO admins
 *   REQ-H1  ADMIN concedido por um PUT comum, sem motivo nem cerimônia
 *   REQ-H4  ação sobre conta alheia não pedia justificativa
 *
 * Uso: pnpm --filter web exec tsx tests/guardas-usuarios.test.ts
 */
import assert from "node:assert/strict";
import {
  HORAS_DA_SENHA_TEMPORARIA,
  MOTIVO_MAXIMO,
  MOTIVO_MINIMO,
  adminsAtivosDepois,
  avaliarAlteracao,
  avaliarCriacao,
  exigeMotivo,
  motivoValido,
  prazoDaTemporaria,
  temporariaVencida,
  type Operacao,
} from "../src/lib/guardas/usuarios";

const MOTIVO = "promocao aprovada pela diretoria em 10/09";

/** Um administrador mexendo em OUTRA conta, tudo válido salvo o que o caso mudar. */
const op = (mudanca: Partial<Operacao> = {}): Operacao => ({
  atorId: "ator",
  alvoId: "alvo",
  papelAtual: "OPERATOR",
  ativoAtual: true,
  adminsAtivos: 2,
  motivo: MOTIVO,
  ...mudanca,
});

// ── REQ-H3: nunca zero administradores ────────────────────────────────────
{
  // O caso exato reproduzido na auditoria: sobrou 1 admin e ele se rebaixou.
  const ultimo = avaliarAlteracao(op({
    atorId: "u1", alvoId: "u2", papelAtual: "ADMIN", papelNovo: "OPERATOR", adminsAtivos: 1,
  }));
  assert.equal(ultimo.ok, false, "rebaixar o último administrador tem que ser recusado");
  assert.equal(ultimo.ok === false && ultimo.status, 409);

  const desativarUltimo = avaliarAlteracao(op({
    atorId: "u1", alvoId: "u2", papelAtual: "ADMIN", ativoNovo: false, adminsAtivos: 1,
  }));
  assert.equal(desativarUltimo.ok, false, "desativar o último administrador também");

  // Com dois, rebaixar um é legítimo.
  assert.equal(
    avaliarAlteracao(op({ atorId: "u1", alvoId: "u2", papelAtual: "ADMIN", papelNovo: "OPERATOR", adminsAtivos: 2 })).ok,
    true,
    "com dois administradores, rebaixar um deixa a casa em pé",
  );
}

// ── A aritmética por trás do H3 ───────────────────────────────────────────
{
  const casos: Array<[string, Partial<Operacao>, number]> = [
    ["rebaixar admin ativo tira um",       { papelAtual: "ADMIN", papelNovo: "OPERATOR" }, 1],
    ["desativar admin ativo tira um",      { papelAtual: "ADMIN", ativoNovo: false },      1],
    ["promover operador soma um",          { papelAtual: "OPERATOR", papelNovo: "ADMIN" }, 3],
    ["reativar admin inativo soma um",     { papelAtual: "ADMIN", ativoAtual: false, ativoNovo: true }, 3],
    ["renomear não mexe na conta",         { papelAtual: "ADMIN" },                        2],
    ["rebaixar admin JÁ inativo não mexe", { papelAtual: "ADMIN", ativoAtual: false, papelNovo: "OPERATOR" }, 2],
    ["promover operador inativo não mexe", { papelAtual: "OPERATOR", ativoAtual: false, papelNovo: "ADMIN" }, 2],
  ];
  for (const [rotulo, mudanca, esperado] of casos) {
    assert.equal(adminsAtivosDepois(op(mudanca)), esperado, rotulo);
  }
}

// ── REQ-H3: ninguém decide sobre o próprio poder ──────────────────────────
{
  const mesmo = { atorId: "eu", alvoId: "eu" };

  const autoRebaixar = avaliarAlteracao(op({ ...mesmo, papelAtual: "ADMIN", papelNovo: "OPERATOR", adminsAtivos: 5 }));
  assert.equal(autoRebaixar.ok, false, "auto-rebaixamento é recusado mesmo com 5 admins");
  assert.equal(autoRebaixar.ok === false && autoRebaixar.status, 403);

  const autoDesativar = avaliarAlteracao(op({ ...mesmo, ativoNovo: false, adminsAtivos: 5 }));
  assert.equal(autoDesativar.ok, false, "auto-desativação também");

  // Mexer no próprio nome continua liberado: não é poder.
  assert.equal(
    avaliarAlteracao(op({ ...mesmo, motivo: undefined })).ok,
    true,
    "trocar o próprio nome não é decisão sobre poder",
  );
}

// ── REQ-H1 e H4: justificativa obrigatória ────────────────────────────────
{
  assert.equal(exigeMotivo(op({ papelNovo: "ADMIN" })), true, "promover exige motivo");
  assert.equal(exigeMotivo(op({ ativoNovo: false })), true, "desativar exige motivo");
  assert.equal(exigeMotivo(op({ papelNovo: "OPERATOR" })), false, "papel igual ao atual não é mudança");
  assert.equal(exigeMotivo(op({ ativoNovo: true })), false, "estado igual ao atual não é mudança");
  assert.equal(exigeMotivo(op({})), false, "só o nome não exige motivo");

  const semMotivo = avaliarAlteracao(op({ papelNovo: "ADMIN", motivo: undefined }));
  assert.equal(semMotivo.ok, false, "promoção sem motivo é recusada");
  assert.equal(semMotivo.ok === false && semMotivo.status, 400);

  assert.equal(avaliarAlteracao(op({ papelNovo: "ADMIN", motivo: "curto" })).ok, false, "motivo curto demais");
  assert.equal(avaliarAlteracao(op({ papelNovo: "ADMIN", motivo: "   " + "x".repeat(3) + "   " })).ok, false,
    "espaço em volta não conta como justificativa");
  assert.equal(avaliarAlteracao(op({ papelNovo: "ADMIN", motivo: "x".repeat(MOTIVO_MAXIMO + 1) })).ok, false,
    "motivo longo demais não cabe na trilha");
}

// ── A validação do motivo, isolada ────────────────────────────────────────
{
  assert.equal(motivoValido("x".repeat(MOTIVO_MINIMO)), true, "no limite mínimo passa");
  assert.equal(motivoValido("x".repeat(MOTIVO_MINIMO - 1)), false, "um a menos não passa");
  assert.equal(motivoValido("x".repeat(MOTIVO_MAXIMO)), true, "no limite máximo passa");
  for (const naoTexto of [undefined, null, 42, {}, [], true]) {
    assert.equal(motivoValido(naoTexto), false, `${JSON.stringify(naoTexto)} não é justificativa`);
  }
}

// ── REQ-H1: criar já como administrador é conceder poder ──────────────────
{
  assert.equal(avaliarCriacao("OPERATOR", undefined).ok, true, "criar operador não exige motivo");
  assert.equal(avaliarCriacao("ADMIN", undefined).ok, false, "criar admin exige motivo");
  assert.equal(avaliarCriacao("ADMIN", "curto").ok, false, "motivo curto não serve nem na criação");
  assert.equal(avaliarCriacao("ADMIN", MOTIVO).ok, true, "com justificativa, criar admin passa");
}

// ── A ordem das recusas ───────────────────────────────────────────────────
{
  // Auto-alvo vem antes de tudo: nem contagem nem motivo salvam.
  const tudoErrado = avaliarAlteracao(op({
    atorId: "eu", alvoId: "eu", papelAtual: "ADMIN", papelNovo: "OPERATOR",
    adminsAtivos: 1, motivo: undefined,
  }));
  assert.equal(tudoErrado.ok === false && tudoErrado.status, 403,
    "o que é sempre proibido é recusado antes do que depende de contagem");

  // Último admin vem antes do motivo: não faz o operador escrever à toa.
  const ultimoSemMotivo = avaliarAlteracao(op({
    atorId: "u1", alvoId: "u2", papelAtual: "ADMIN", papelNovo: "OPERATOR",
    adminsAtivos: 1, motivo: undefined,
  }));
  assert.equal(ultimoSemMotivo.ok === false && ultimoSemMotivo.status, 409,
    "a operação impossível é recusada antes de cobrar a justificativa");
}

// ── O prazo PRÓPRIO da senha temporária ───────────────────────────────────
{
  // A marca `must_change_password` só age se o login CHEGAR A ACONTECER. O
  // caso perigoso é a conta provisionada e nunca usada: a senha ficou numa
  // conversa de WhatsApp e valia para sempre. Medido assim na auditoria de
  // 2026-09-10, quando não existia coluna de prazo nenhuma.
  const AGORA = new Date("2026-09-10T12:00:00.000Z");
  const horas = (n: number) => new Date(AGORA.getTime() + n * 3600_000);

  assert.ok(HORAS_DA_SENHA_TEMPORARIA > 0, "prazo zero barraria o primeiro acesso");
  assert.ok(
    HORAS_DA_SENHA_TEMPORARIA <= 168,
    "mais de uma semana já é senha permanente com outro nome",
  );
  assert.equal(
    prazoDaTemporaria(AGORA).getTime(),
    horas(HORAS_DA_SENHA_TEMPORARIA).getTime(),
    "o prazo sai do instante em que a temporária foi definida",
  );

  // Senha do próprio dono nunca vence por aqui.
  assert.equal(
    temporariaVencida({ mustChangePassword: false, tempPasswordExpiresAt: horas(-1) }, AGORA),
    false,
    "sem a marca de temporária, prazo velho não barra ninguém",
  );
  // Conta antiga, de antes de a coluna existir: sem prazo, não vence.
  assert.equal(
    temporariaVencida({ mustChangePassword: true, tempPasswordExpiresAt: null }, AGORA),
    false,
    "temporária sem prazo gravado não pode trancar quem já usava o sistema",
  );

  assert.equal(
    temporariaVencida({ mustChangePassword: true, tempPasswordExpiresAt: horas(1) }, AGORA),
    false,
    "dentro do prazo, entra",
  );
  assert.equal(
    temporariaVencida({ mustChangePassword: true, tempPasswordExpiresAt: horas(-1) }, AGORA),
    true,
    "passado o prazo, não entra",
  );
  // O instante exato da virada.
  assert.equal(
    temporariaVencida({ mustChangePassword: true, tempPasswordExpiresAt: AGORA }, AGORA),
    true,
    "no milissegundo do vencimento já está vencida",
  );
  assert.equal(
    temporariaVencida(
      { mustChangePassword: true, tempPasswordExpiresAt: new Date(AGORA.getTime() + 1) },
      AGORA,
    ),
    false,
    "um milissegundo antes ainda vale",
  );
}

console.log("OK — guardas da administracao de contas travadas.");
