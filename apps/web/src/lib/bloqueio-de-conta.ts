import { eq, sql } from "drizzle-orm";
import { db, usuarios, vivosE } from "@/lib/db";

// ---------------------------------------------------------------------------
// Bloqueio de login por CONTA.
//
// O limitador por IP não protege uma conta específica: o cabeçalho é forjável
// e rodar o `X-Forwarded-For` zera o contador. Isso foi medido na auditoria de
// 2026-09-10 -- 12 tentativas contra a mesma conta e a senha certa entrou na
// 13ª. O contador que importa é este.
//
// Três decisões que a régua exige e que valem explicar:
//
//   1. O incremento é UMA operação condicional do banco, nunca ler-decidir-
//      escrever. Oito tentativas em paralelo têm que contar oito; com leitura
//      separada, as oito leem o mesmo valor e contam uma.
//   2. A janela é deslizante. Duas falhas hoje e três daqui a um mês não são
//      um ataque, são memória ruim.
//   3. Conta já travada não conta nova falha. Do contrário o atacante estende
//      o bloqueio para sempre, e a vítima nunca reentra -- o bloqueio vira a
//      negação de serviço que deveria impedir.
// ---------------------------------------------------------------------------

/** Falhas seguidas até travar. */
export const FALHAS_ATE_TRAVAR = 5;
/** Quanto a conta fica travada. Finita: o dono reentra sozinho. */
export const MINUTOS_TRAVADO = 15;
/** Falha mais antiga que isto não conta para a sequência. */
export const MINUTOS_DA_JANELA = 15;

export interface EstadoDoBloqueio {
  travada: boolean;
  /** Quando destrava. Só faz sentido quando `travada`. */
  ate: Date | null;
  falhas: number;
}

/**
 * A conta está travada AGORA?
 *
 * Pura, e por isso testável. A coluna não é limpa quando o prazo expira --
 * presença de valor não é bloqueio, o que importa é a comparação com o
 * instante atual.
 */
export function estaTravada(
  usuario: { lockedUntil: Date | null; failedAttempts: number },
  agora: Date = new Date()
): EstadoDoBloqueio {
  const ate = usuario.lockedUntil;
  const travada = ate !== null && ate.getTime() > agora.getTime();
  return { travada, ate: travada ? ate : null, falhas: usuario.failedAttempts };
}

/**
 * Registra uma falha e devolve o estado resultante.
 *
 * Tudo numa instrução: a janela é avaliada, o contador sobe e o bloqueio é
 * aplicado no mesmo `UPDATE`, com o banco resolvendo a concorrência. É o que
 * faz oito tentativas paralelas contarem oito.
 */
export async function registrarFalha(userId: string): Promise<EstadoDoBloqueio> {
  const janela = sql.raw(`interval '${MINUTOS_DA_JANELA} minutes'`);
  const castigo = sql.raw(`interval '${MINUTOS_TRAVADO} minutes'`);

  // A contagem depois desta falha: reinicia se a anterior caiu fora da janela.
  const proximaContagem = sql`CASE
      WHEN ${usuarios.lastFailedAt} IS NULL OR ${usuarios.lastFailedAt} < now() - ${janela}
      THEN 1
      ELSE ${usuarios.failedAttempts} + 1
    END`;

  const [linha] = await db
    .update(usuarios)
    .set({
      failedAttempts: proximaContagem,
      lastFailedAt: sql`now()`,
      lockedUntil: sql`CASE
          WHEN ${proximaContagem} >= ${FALHAS_ATE_TRAVAR} THEN now() + ${castigo}
          ELSE ${usuarios.lockedUntil}
        END`,
    })
    .where(eq(usuarios.id, userId))
    .returning({
      failedAttempts: usuarios.failedAttempts,
      lockedUntil: usuarios.lockedUntil,
    });

  if (!linha) return { travada: false, ate: null, falhas: 0 };
  return estaTravada(linha);
}

/**
 * Login aceito: zera a sequência.
 *
 * Sem isto, falhas espalhadas ao longo de meses acabariam travando quem sempre
 * entrou direito.
 */
export async function limparFalhas(userId: string): Promise<void> {
  await db
    .update(usuarios)
    .set({ failedAttempts: 0, lastFailedAt: null, lockedUntil: null })
    .where(eq(usuarios.id, userId));
}

/** Destrava a conta por ação administrativa. Devolve se havia trava mesmo. */
export async function destravar(userId: string): Promise<boolean> {
  const [linha] = await db
    .select({ lockedUntil: usuarios.lockedUntil, failedAttempts: usuarios.failedAttempts })
    .from(usuarios)
    // Conta apagada nao se destrava: `vivos` filtra o soft delete.
    .where(vivosE(usuarios, eq(usuarios.id, userId)))
    .limit(1);
  if (!linha) return false;

  const estava = estaTravada(linha).travada;
  await limparFalhas(userId);
  return estava;
}
