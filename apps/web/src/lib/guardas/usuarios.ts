import type { Papel } from "@/lib/db/schema/users";

// ---------------------------------------------------------------------------
// As regras que protegem a administração de contas.
//
// Vivem aqui, puras e sem banco, por dois motivos: dá pra testá-las sem subir
// nada, e a rota fica com uma leitura só -- consultar o estado e perguntar.
//
// Cada uma nasceu de um defeito reproduzido na auditoria de 2026-09-10:
//
//   REQ-H3  o último administrador se auto-rebaixou e o sistema ficou com zero
//   REQ-H1  ADMIN concedido por um PUT comum, sem motivo e sem cerimônia
//   REQ-H4  ação sobre conta alheia não pedia justificativa nenhuma
//   REQ-E8  admin escolhia a senha DEFINITIVA de outra pessoa
// ---------------------------------------------------------------------------

/** Curto demais não é justificativa; longo demais não cabe na trilha. */
/**
 * Prazo da senha que um administrador define.
 *
 * Tres dias uteis dao folga para o primeiro acesso sem deixar a credencial
 * viva indefinidamente numa caixa de mensagem. A marca `must_change_password`
 * cuida do resto: ela so age se o login acontecer, e este prazo e o que cobre
 * o login que nunca aconteceu.
 */
export const HORAS_DA_SENHA_TEMPORARIA = 72;

/** Quando a temporaria definida agora deixa de valer. */
export function prazoDaTemporaria(agora: Date = new Date()): Date {
  return new Date(agora.getTime() + HORAS_DA_SENHA_TEMPORARIA * 60 * 60 * 1000);
}

/**
 * A senha temporaria desta conta ainda vale?
 *
 * Pura, e por isso testavel. Sem prazo gravado significa senha do proprio dono
 * -- e essa nunca vence por aqui.
 */
export function temporariaVencida(
  conta: { mustChangePassword: boolean; tempPasswordExpiresAt: Date | null },
  agora: Date = new Date()
): boolean {
  if (!conta.mustChangePassword) return false;
  if (conta.tempPasswordExpiresAt === null) return false;
  return conta.tempPasswordExpiresAt.getTime() <= agora.getTime();
}

export const MOTIVO_MINIMO = 8;
export const MOTIVO_MAXIMO = 255;

export type Recusa = { ok: false; erro: string; status: 400 | 403 | 409 };
export type Permissao = { ok: true };
export type Veredicto = Permissao | Recusa;

const OK: Permissao = { ok: true };

/** O que a rota já sabe sobre a operação antes de decidir. */
export interface Operacao {
  atorId: string;
  alvoId: string;
  /** Papel do alvo hoje. */
  papelAtual: Papel;
  /** Se o alvo está ativo hoje. */
  ativoAtual: boolean;
  /** Papel pedido, quando o corpo trouxe `role`. */
  papelNovo?: Papel;
  /** Estado pedido, quando o corpo trouxe `active`. */
  ativoNovo?: boolean;
  /** Quantos administradores ATIVOS existem agora, contando o alvo. */
  adminsAtivos: number;
  /** Justificativa que veio no corpo. */
  motivo?: unknown;
}

/** Mudanças que exigem justificativa escrita, porque mexem em quem pode o quê. */
export function exigeMotivo(op: Operacao): boolean {
  const mudaPapel = op.papelNovo !== undefined && op.papelNovo !== op.papelAtual;
  const mudaAtivo = op.ativoNovo !== undefined && op.ativoNovo !== op.ativoAtual;
  return mudaPapel || mudaAtivo;
}

export function motivoValido(motivo: unknown): motivo is string {
  return (
    typeof motivo === "string" &&
    motivo.trim().length >= MOTIVO_MINIMO &&
    motivo.trim().length <= MOTIVO_MAXIMO
  );
}

/**
 * Depois desta operação, sobraria algum administrador ativo?
 *
 * Conta só o efeito sobre o alvo: rebaixar um admin ativo, ou desativá-lo,
 * tira um da conta. Promover ou reativar soma.
 */
export function adminsAtivosDepois(op: Operacao): number {
  const eraAdminAtivo = op.papelAtual === "ADMIN" && op.ativoAtual;
  const papel = op.papelNovo ?? op.papelAtual;
  const ativo = op.ativoNovo ?? op.ativoAtual;
  const seraAdminAtivo = papel === "ADMIN" && ativo;

  if (eraAdminAtivo && !seraAdminAtivo) return op.adminsAtivos - 1;
  if (!eraAdminAtivo && seraAdminAtivo) return op.adminsAtivos + 1;
  return op.adminsAtivos;
}

/**
 * O veredicto sobre alterar outra conta.
 *
 * A ordem das recusas é deliberada: o que é sempre proibido vem antes do que
 * depende de contagem, e a justificativa é cobrada por último, pra ninguém
 * escrever um motivo bonito e só então descobrir que a operação nunca podia.
 */
export function avaliarAlteracao(op: Operacao): Veredicto {
  const mudaPapel = op.papelNovo !== undefined && op.papelNovo !== op.papelAtual;
  const mudaAtivo = op.ativoNovo !== undefined && op.ativoNovo !== op.ativoAtual;

  // Ninguém decide sobre o próprio poder. Fecha tanto a auto-promoção quanto
  // o auto-rebaixamento que zerou os administradores na auditoria.
  if (op.atorId === op.alvoId && (mudaPapel || mudaAtivo)) {
    return {
      ok: false,
      status: 403,
      erro: "Voce nao pode alterar o proprio papel nem o proprio acesso. Peca a outro administrador.",
    };
  }

  // Sem administrador ativo, a administração do sistema fica inacessível e não
  // há caminho de volta pela aplicação.
  if (adminsAtivosDepois(op) < 1) {
    return {
      ok: false,
      status: 409,
      erro: "Esta e a ultima conta de administrador ativa. Promova outra pessoa antes de rebaixar ou desativar esta.",
    };
  }

  if (exigeMotivo(op) && !motivoValido(op.motivo)) {
    return {
      ok: false,
      status: 400,
      erro: `Mudanca de papel ou de acesso exige um motivo entre ${MOTIVO_MINIMO} e ${MOTIVO_MAXIMO} caracteres.`,
    };
  }

  return OK;
}

/**
 * O veredicto sobre criar uma conta já como administrador.
 *
 * Criar um ADMIN é conceder o privilégio máximo, mesmo que a conta seja nova.
 * Cobra a mesma justificativa que promover alguém.
 */
export function avaliarCriacao(papel: Papel, motivo: unknown): Veredicto {
  if (papel !== "ADMIN") return OK;
  if (!motivoValido(motivo)) {
    return {
      ok: false,
      status: 400,
      erro: `Criar uma conta de administrador exige um motivo entre ${MOTIVO_MINIMO} e ${MOTIVO_MAXIMO} caracteres.`,
    };
  }
  return OK;
}

/** O texto que vai pra trilha, já aparado. */
export function motivoParaTrilha(motivo: unknown): string | null {
  return motivoValido(motivo) ? motivo.trim() : null;
}
