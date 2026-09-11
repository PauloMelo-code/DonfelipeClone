import { db, trilhaAuditoria } from "@/lib/db";
import { extractRequestMeta } from "@/lib/request-meta";

// ---------------------------------------------------------------------------
// Trilha de auditoria — uma implementacao, todo mundo chama esta.
//
// Antes, 14 rotas montavam o INSERT a mao e so 3 registravam IP e User-Agent
// -- nenhuma delas de privilegio. Criar ADMIN, rebaixar o ultimo admin e
// definir senha alheia entravam na trilha sem origem nenhuma.
// ---------------------------------------------------------------------------

export interface EntradaAuditoria {
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  /** Objeto qualquer; serializado como JSON. Nunca ponha segredo aqui. */
  details?: unknown;
  userId?: string | null;
  vehicleId?: string | null;
  /** A requisicao, para extrair IP e User-Agent pela leitura canonica. */
  request?: Request | null;
  /**
   * Origem ja lida, para quem nao tem um `Request` na mao.
   *
   * O `authorize` do next-auth e o caso: ele recebe um objeto de cabecalhos,
   * nao um `Request`. Sem esta porta, os eventos de login deixavam as colunas
   * `ip_address` e `user_agent` VAZIAS e repetiam o dado dentro do JSON --
   * e ai filtrar a auditoria por IP simplesmente nao achava login nenhum.
   */
  ipAddress?: string | null;
  userAgent?: string | null;
}

function montarLinha(entrada: EntradaAuditoria) {
  const meta = entrada.request ? extractRequestMeta(entrada.request) : null;
  return {
    action: entrada.action,
    entityType: entrada.entityType ?? null,
    entityId: entrada.entityId ?? null,
    details:
      entrada.details === undefined
        ? null
        : typeof entrada.details === "string"
          ? entrada.details
          : JSON.stringify(entrada.details),
    userId: entrada.userId ?? null,
    vehicleId: entrada.vehicleId ?? null,
    ipAddress: entrada.ipAddress ?? meta?.ipAddress ?? null,
    userAgent: entrada.userAgent ?? meta?.userAgent ?? null,
  };
}

/**
 * Registra a acao. FAIL-OPEN: nunca derruba a operacao do usuario por causa
 * da trilha; grava CRITICAL no log do servidor e segue.
 *
 * Use para acao comum (aprovar veiculo, publicar, mexer em configuracao).
 * Para CONCESSAO DE PODER use `registrarAuditoriaObrigatoria`.
 */
export async function registrarAuditoria(entrada: EntradaAuditoria): Promise<void> {
  try {
    await db.insert(trilhaAuditoria).values(montarLinha(entrada));
  } catch (erro) {
    console.error("[CRITICAL][auditoria] falha ao gravar a trilha:", entrada.action, erro);
  }
}

/**
 * Quem executa o INSERT: o banco, ou uma transacao aberta.
 *
 * Existe pela regra fail-closed: quando a trilha e gravada dentro da mesma
 * transacao do efeito, um erro em qualquer das duas desfaz as duas. Fora da
 * transacao, o rollback do efeito deixaria a trilha registrando algo que nao
 * aconteceu.
 */
export type Executor = Pick<typeof db, "insert">;

/**
 * Registra ANTES do efeito e FAIL-CLOSED: se a trilha nao grava, a operacao
 * nao acontece.
 *
 * Use quando o efeito destroi o estado anterior e ninguem conseguiria provar
 * o que havia antes: promover a administrador, destravar conta, definir senha
 * de outra pessoa. Passe a transacao sempre que houver uma.
 */
export async function registrarAuditoriaObrigatoria(
  entrada: EntradaAuditoria,
  executor: Executor = db
): Promise<void> {
  await executor.insert(trilhaAuditoria).values(montarLinha(entrada));
}
