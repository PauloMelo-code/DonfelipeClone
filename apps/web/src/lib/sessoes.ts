import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db, usuarios, sessoes, vivos, vivosE } from "@/lib/db";

// ---------------------------------------------------------------------------
// Sessao no banco.
//
// O cookie continua sendo um JWT assinado, mas ele nao decide mais nada:
// carrega o id de uma linha, e a linha e que diz se a sessao vale. Enquanto a
// autoridade morava no token, "desligar alguem" e "trocar o fator" so passavam
// a valer quando o token vencesse -- ate 24 h depois.
//
// Tres prazos, e nenhum deles substitui os outros:
//
//   1. TETO ABSOLUTO. Passou de `expires_at`, acabou, por mais ativa que
//      esteja. E o que garante que uma sessao nao vive para sempre sendo
//      renovada.
//   2. INATIVIDADE. Notebook esquecido aberto na concessionaria fecha sozinho.
//   3. REVOGACAO. O dono encerra, ou o sistema encerra ao trocar o fator.
// ---------------------------------------------------------------------------

/** Teto absoluto de vida da sessao. */
export const HORAS_DE_VIDA = 24;
/** Silencio que encerra a sessao sozinha. */
export const MINUTOS_DE_INATIVIDADE = 60;
/**
 * Quanto tempo antes de reescrever `last_seen_at`.
 *
 * Sem isso, toda requisicao viraria uma escrita no banco. Com um minuto de
 * folga, a precisao perdida e irrelevante para uma janela de sessenta.
 */
const SEGUNDOS_ENTRE_TOQUES = 60;

export type MotivoDaRevogacao =
  | "logout"
  | "pelo-dono"
  | "fator-trocado"
  | "senha-trocada"
  | "conta-desativada";

export interface Origem {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Abre uma sessao e devolve o id que vai dentro do cookie.
 *
 * Uma linha NOVA por entrada, sempre. E o que impede fixacao de sessao: nao
 * existe caminho em que alguem entra reaproveitando um identificador que ja
 * conhecia antes do login.
 */
export async function abrirSessao(userId: string, origem: Origem): Promise<string> {
  const [linha] = await db
    .insert(sessoes)
    .values({
      userId,
      ipAddress: origem.ip ?? null,
      userAgent: origem.userAgent ?? null,
      expiresAt: sql`now() + interval '${sql.raw(String(HORAS_DE_VIDA))} hours'`,
      modifiedBy: userId,
    })
    .returning({ id: sessoes.id });

  return linha.id;
}

export interface ContaDaSessao {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  mustChangePassword: boolean;
  totpEnabledAt: Date | null;
  sessaoId: string;
  precisaTocar: boolean;
}

/**
 * A sessao vale AGORA? Devolve a conta junto, ou null.
 *
 * Uma consulta so, e os tres prazos avaliados pelo relogio do BANCO, nunca
 * pelo do processo: dois servidores com relogios diferentes concordariam sobre
 * a sessao valer ou nao, mas discordariam sobre quando. O papel e o `active`
 * vem daqui pelo mesmo motivo de sempre -- congelados no token, valeriam por
 * mais um dia depois de mudarem.
 */
export async function carregarSessao(sessaoId: string): Promise<ContaDaSessao | null> {
  const [linha] = await db
    .select({
      id: usuarios.id,
      email: usuarios.email,
      name: usuarios.name,
      role: usuarios.role,
      active: usuarios.active,
      mustChangePassword: usuarios.mustChangePassword,
      totpEnabledAt: usuarios.totpEnabledAt,
      sessaoId: sessoes.id,
      // Vale a pena reescrever `last_seen_at` nesta requisicao?
      precisaTocar: sql<boolean>`${sessoes.lastSeenAt} < now() - interval '${sql.raw(
        String(SEGUNDOS_ENTRE_TOQUES)
      )} seconds'`,
    })
    .from(sessoes)
    .innerJoin(usuarios, eq(usuarios.id, sessoes.userId))
    .where(
      and(
        vivos(sessoes),
        vivos(usuarios),
        eq(sessoes.id, sessaoId),
        isNull(sessoes.revokedAt),
        sql`${sessoes.expiresAt} > now()`,
        sql`${sessoes.lastSeenAt} > now() - interval '${sql.raw(
          String(MINUTOS_DE_INATIVIDADE)
        )} minutes'`
      )
    )
    .limit(1);

  return linha ?? null;
}

/**
 * Marca atividade. Condicional, para nao escrever a cada requisicao.
 *
 * O prazo tambem entra no WHERE: uma sessao que venceu entre a leitura e esta
 * escrita nao pode ser ressuscitada pelo proprio toque.
 */
export async function tocar(sessaoId: string): Promise<void> {
  await db
    .update(sessoes)
    .set({ lastSeenAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(
        vivos(sessoes),
        eq(sessoes.id, sessaoId),
        isNull(sessoes.revokedAt),
        sql`${sessoes.expiresAt} > now()`
      )
    );
}

/**
 * Encerra uma sessao. Devolve se havia mesmo o que encerrar.
 *
 * `userId` entra no WHERE sempre: e o que impede encerrar a sessao de outra
 * pessoa sabendo o id dela. `revoked_at IS NULL` tambem, para a linha guardar
 * o instante da PRIMEIRA revogacao e o motivo original.
 */
export async function revogar(
  sessaoId: string,
  userId: string,
  motivo: MotivoDaRevogacao
): Promise<boolean> {
  const [linha] = await db
    .update(sessoes)
    .set({ revokedAt: sql`now()`, revokedReason: motivo, updatedAt: sql`now()`, modifiedBy: userId })
    .where(
      vivosE(sessoes, eq(sessoes.id, sessaoId), eq(sessoes.userId, userId), isNull(sessoes.revokedAt))
    )
    .returning({ id: sessoes.id });

  return Boolean(linha);
}

/**
 * Encerra TODAS as sessoes de alguem. Devolve quantas caiu.
 *
 * E o que faz "trocar o fator derruba as sessoes" valer de verdade. O
 * `exceto` existe para o caso em que o dono encerra as outras e continua na
 * que esta usando.
 */
export async function revogarTodasDe(
  userId: string,
  motivo: MotivoDaRevogacao,
  opcoes: { exceto?: string; executor?: Pick<typeof db, "update"> } = {}
): Promise<number> {
  const executor = opcoes.executor ?? db;
  const linhas = await executor
    .update(sessoes)
    .set({ revokedAt: sql`now()`, revokedReason: motivo, updatedAt: sql`now()`, modifiedBy: userId })
    .where(
      vivosE(
        sessoes,
        eq(sessoes.userId, userId),
        isNull(sessoes.revokedAt),
        opcoes.exceto ? ne(sessoes.id, opcoes.exceto) : undefined
      )
    )
    .returning({ id: sessoes.id });

  return linhas.length;
}

export interface SessaoNaTela {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}

/**
 * As sessoes VIVAS do dono, para a tela de seguranca.
 *
 * Devolve origem e datas. Nada aqui autentica: o id e um ponteiro, e sem o
 * cookie assinado ele nao abre nada -- por isso ele pode voltar para a tela,
 * que precisa dele para marcar "esta e a sua" e para encerrar as outras.
 */
export async function listar(userId: string): Promise<SessaoNaTela[]> {
  return db
    .select({
      id: sessoes.id,
      ipAddress: sessoes.ipAddress,
      userAgent: sessoes.userAgent,
      createdAt: sessoes.createdAt,
      lastSeenAt: sessoes.lastSeenAt,
      expiresAt: sessoes.expiresAt,
    })
    .from(sessoes)
    .where(
      and(
        vivos(sessoes),
        eq(sessoes.userId, userId),
        isNull(sessoes.revokedAt),
        sql`${sessoes.expiresAt} > now()`,
        sql`${sessoes.lastSeenAt} > now() - interval '${sql.raw(
          String(MINUTOS_DE_INATIVIDADE)
        )} minutes'`
      )
    )
    .orderBy(sql`${sessoes.lastSeenAt} desc`);
}
