import { registrarAuditoria } from "@/lib/audit";

// ---------------------------------------------------------------------------
// Trilha de entrada.
//
// Fecha os REQ-L1 e REQ-L2 da auditoria de 2026-09-10, que terminou com quatro
// linhas na trilha: nenhum login, nenhuma falha, nenhum bloqueio -- nem o
// sistema ficando sem administrador.
//
// Fica pendurada no FUNIL, o `authorize` do provider, e não numa lista de
// rotas. Todo caminho que cria sessão passa por lá; uma lista de URLs deixaria
// de fora o próximo caminho que aparecer.
//
// O que nunca entra aqui: senha, hash, token, o valor tentado. Só o e-mail
// digitado, que é o que permite investigar depois.
// ---------------------------------------------------------------------------

export type MotivoDaRecusa =
  | "credencial_invalida"
  | "conta_desativada"
  | "conta_travada"
  | "limite_por_ip"
  | "entrada_malformada"
  /** Senha certa, segundo fator ausente ou errado. Nunca o codigo tentado. */
  | "segundo_fator_invalido"
  /** Assinatura de passkey que nao confere, ou desafio vencido/ja usado. */
  | "passkey_invalida"
  /** A senha que um administrador definiu passou do prazo dela. */
  | "senha_temporaria_vencida";

/**
 * Como a pessoa provou quem e.
 *
 * `senha` sozinha so aparece na conta que ainda nao cadastrou o fator -- e
 * essa sessao nao alcanca nada alem da propria tela de cadastro. Ver uma
 * dessas fora do periodo de implantacao e sinal de que alguma conta escapou
 * do fator obrigatorio.
 *
 * `passkey` nao leva senha junto porque nao precisa: a credencial e a posse do
 * autenticador, e a biometria ou o PIN exigidos pelo servidor sao o segundo
 * passo, dentro da mesma operacao.
 */
export type MeioDaEntrada = "senha" | "senha+totp" | "senha+resgate" | "passkey";

/** Teto de espera da gravação: a trilha nunca segura o login. */
const TETO_MS = 3000;

interface Contexto {
  /** O e-mail digitado. Pode não corresponder a conta nenhuma. */
  email?: string | null;
  /** Só existe quando a conta foi encontrada. */
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Grava sem nunca derrubar o login.
 *
 * Fail-open com aviso: se a trilha falhar ou demorar, o registro se perde e o
 * servidor grita no log, mas quem estava entrando entra. A alternativa seria
 * um banco de auditoria intermitente derrubando a autenticação inteira.
 *
 * O `catch` está na promessa da gravação, e não só em volta da corrida: uma
 * rejeição que chegasse depois do teto viraria perda muda.
 */
async function gravar(entrada: Parameters<typeof registrarAuditoria>[0]): Promise<void> {
  try {
    const gravacao = registrarAuditoria(entrada).catch((erro) => {
      console.error("[CRITICAL][trilha-de-login] falha ao gravar:", entrada.action, erro);
    });
    const teto = new Promise<void>((resolve) => setTimeout(resolve, TETO_MS));
    await Promise.race([gravacao, teto]);
  } catch (erro) {
    console.error("[CRITICAL][trilha-de-login] erro inesperado:", entrada.action, erro);
  }
}

/**
 * Alguém entrou.
 *
 * O `meio` é o que separa a entrada com segundo fator da entrada de conta que
 * ainda não cadastrou -- e é por ele que se descobre um resgate consumido, que
 * merece olhada: ou a pessoa perdeu o celular, ou alguém usou o papel dela.
 */
export async function registrarEntrada(
  ctx: Contexto & { userId: string; meio: MeioDaEntrada }
): Promise<void> {
  await gravar({
    action: "LOGIN_SUCCESS",
    entityType: "User",
    entityId: ctx.userId,
    userId: ctx.userId,
    details: { meio: ctx.meio, email: ctx.email ?? null },
    ipAddress: ctx.ip,
    userAgent: ctx.userAgent,
  });
}

/**
 * Alguém tentou e não entrou.
 *
 * O `userId` fica nulo quando o e-mail não existe -- e a linha é gravada
 * mesmo assim. É o registro de e-mail inexistente que denuncia varredura de
 * contas, e é justamente o que não existia antes.
 */
export async function registrarRecusa(
  ctx: Contexto & { motivo: MotivoDaRecusa }
): Promise<void> {
  await gravar({
    action: "LOGIN_FAILED",
    entityType: "User",
    entityId: ctx.userId ?? null,
    userId: ctx.userId ?? null,
    details: { motivo: ctx.motivo, email: ctx.email ?? null },
    ipAddress: ctx.ip,
    userAgent: ctx.userAgent,
  });
}

/**
 * Alguém saiu, ou teve a sessão encerrada.
 *
 * A régua pede logout na trilha pelo mesmo motivo que pede login: sem o par,
 * não dá para reconstruir por quanto tempo uma sessão esteve aberta -- que é
 * a pergunta de toda investigação depois do fato.
 */
export async function registrarSaida(
  ctx: Contexto & { userId: string; sessaoId: string; motivo: string; quantas?: number }
): Promise<void> {
  await gravar({
    action: "LOGOUT",
    entityType: "User",
    entityId: ctx.userId,
    userId: ctx.userId,
    details: { motivo: ctx.motivo, sessaoId: ctx.sessaoId, quantas: ctx.quantas ?? 1 },
    ipAddress: ctx.ip,
    userAgent: ctx.userAgent,
  });
}

/** A conta acabou de travar. Evento próprio: é o que dispara alerta. */
export async function registrarBloqueio(
  ctx: Contexto & { userId: string; ate: Date; falhas: number }
): Promise<void> {
  await gravar({
    action: "ACCOUNT_LOCKED",
    entityType: "User",
    entityId: ctx.userId,
    userId: ctx.userId,
    details: { falhas: ctx.falhas, travadaAte: ctx.ate.toISOString(), email: ctx.email ?? null },
    ipAddress: ctx.ip,
    userAgent: ctx.userAgent,
  });
}
