import { Queue, Worker, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { eq } from "drizzle-orm";
import { db, veiculos, carimboDeEdicao, vivosE } from "@/lib/db";
import { registrarAuditoria } from "@/lib/audit";
import { publishVehicle } from "@/lib/publisher";

// ---------------------------------------------------------------------------
// Fila FIFO de publicacao.
//
// A publicacao leva minutos: ha delay anti-ban por grupo e, no lote, delay
// entre veiculos. Antes isso rodava como promise solta dentro do handler HTTP
// -- 40 grupos deixavam a requisicao pendurada, um timeout de proxy no meio
// deixava metade publicada sem registro do que faltou, e um reinicio perdia a
// fila inteira em silencio.
//
// Agora cada veiculo e um job em Redis: ordem de entrada e ordem de
// processamento, retentativa com espera crescente e DLQ apos 3 tentativas.
//
// SEM REDIS_URL a fila nao existe e o trabalho roda em linha, como antes.
// Isso mantem o sistema instalavel sem Redis; o log avisa em cada disparo.
// ---------------------------------------------------------------------------

export const NOME_DA_FILA = "publicacao";

export interface TrabalhoDePublicacao {
  vehicleId: string;
  targetGroupIds?: string[];
  formattedAd?: string;
  sellingPrice?: number;
  photos?: string[];
  userId?: string | null;
  quickPublish?: boolean;
  /** Republicacao: se nada foi enviado, devolve o status para PUBLISHED. */
  restaurarPublicado?: boolean;
  /** Grava trilha propria ao fim (usado pela publicacao direta). */
  trilha?: {
    action: string;
    triggeredBy?: string;
    sourceState?: string | null;
    destinationGroups?: number;
  };
}

const URL_REDIS = process.env.REDIS_URL ?? "";

let _conexao: IORedis | null = null;
function conexao(): IORedis | null {
  if (!URL_REDIS) return null;
  if (!_conexao) {
    _conexao = new IORedis(URL_REDIS, {
      // Exigido pelo BullMQ: o worker bloqueia esperando job.
      maxRetriesPerRequest: null,
    });
  }
  return _conexao;
}

let _fila: Queue<TrabalhoDePublicacao> | null = null;
function fila(): Queue<TrabalhoDePublicacao> | null {
  const c = conexao();
  if (!c) return null;
  if (!_fila) {
    _fila = new Queue<TrabalhoDePublicacao>(NOME_DA_FILA, { connection: c });
  }
  return _fila;
}

const OPCOES_PADRAO: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 10_000 },
  // Mantem os que falharam para inspecao; limpa os que deram certo.
  removeOnComplete: { count: 100 },
  removeOnFail: false,
};

/**
 * Faz o trabalho de fato. Chamada pelo worker e, sem Redis, direto pelo
 * `enfileirarPublicacao`.
 *
 * E idempotente na pratica: `canPostVehicle` ja impede repostar o mesmo carro
 * no mesmo grupo dentro da janela de dias uteis, entao uma retentativa nao
 * duplica publicacao.
 */
export async function executarPublicacao(t: TrabalhoDePublicacao): Promise<void> {
  try {
    const resultados = await publishVehicle(t.vehicleId, {
      targetGroupIds: t.targetGroupIds,
      formattedAd: t.formattedAd,
      sellingPrice: t.sellingPrice,
      photos: t.photos,
      userId: t.userId ?? undefined,
      quickPublish: t.quickPublish,
    });

    if (t.restaurarPublicado && !resultados.some((r) => r.success)) {
      // Nada saiu: o veiculo volta a PUBLISHED em vez de ficar preso em APPROVED.
      await db
        .update(veiculos)
        .set({ status: "PUBLISHED", ...carimboDeEdicao(t.userId ?? null) })
        .where(vivosE(veiculos, eq(veiculos.id, t.vehicleId)));
    }

    if (t.trilha) {
      await registrarAuditoria({
        action: t.trilha.action,
        entityType: "Vehicle",
        entityId: t.vehicleId,
        vehicleId: t.vehicleId,
        userId: t.userId ?? null,
        details: {
          ...(t.trilha.triggeredBy ? { triggeredBy: t.trilha.triggeredBy } : {}),
          sourceState: t.trilha.sourceState ?? null,
          destinationGroups: t.trilha.destinationGroups ?? t.targetGroupIds?.length ?? 0,
          totalSent: resultados.filter((r) => r.success).length,
          totalFailed: resultados.filter((r) => !r.success && !r.skippedReason).length,
          totalSkipped: resultados.filter((r) => !!r.skippedReason).length,
        },
      });
    }
  } catch (erro) {
    console.error(`[fila:publicacao] veiculo ${t.vehicleId} falhou:`, erro);
    if (t.restaurarPublicado) {
      await db
        .update(veiculos)
        .set({ status: "PUBLISHED", ...carimboDeEdicao(t.userId ?? null) })
        .where(vivosE(veiculos, eq(veiculos.id, t.vehicleId)))
        .catch(() => {});
    }
    throw erro; // deixa o BullMQ contar a tentativa
  } finally {
    // A trava de publicacao sempre cai, deu certo ou nao.
    await db
      .update(veiculos)
      .set({ publishingLockedAt: null })
      .where(vivosE(veiculos, eq(veiculos.id, t.vehicleId)))
      .catch(() => {});
  }
}

/**
 * Coloca a publicacao na fila. Sem Redis configurado, executa em linha e
 * avisa no log -- o comportamento antigo, com as mesmas perdas de antes.
 */
export async function enfileirarPublicacao(t: TrabalhoDePublicacao): Promise<void> {
  const f = fila();
  if (!f) {
    console.warn(
      "[fila:publicacao] REDIS_URL nao configurada: publicando em linha, sem retentativa nem durabilidade."
    );
    void executarPublicacao(t).catch((e) =>
      console.error("[fila:publicacao] execucao em linha falhou:", e)
    );
    return;
  }
  await f.add("publicar", t, OPCOES_PADRAO);
}

let _worker: Worker<TrabalhoDePublicacao> | null = null;

/**
 * Sobe o worker. Chamado uma vez pelo `instrumentation.ts` do Next.
 *
 * ponytail: roda no mesmo processo do servidor web. Da durabilidade e
 * retentativa, que e o que faltava. Se a publicacao passar a competir por CPU
 * com as requisicoes, mover para um container proprio rodando so este worker.
 */
export function iniciarWorker(): void {
  const c = conexao();
  if (!c) {
    console.warn("[fila:publicacao] REDIS_URL nao configurada: worker nao iniciado.");
    return;
  }
  if (_worker) return;

  _worker = new Worker<TrabalhoDePublicacao>(
    NOME_DA_FILA,
    async (job) => executarPublicacao(job.data),
    {
      connection: c,
      // FIFO de verdade: um veiculo por vez, na ordem de entrada.
      concurrency: 1,
    }
  );

  _worker.on("failed", (job, erro) => {
    const tentativa = job?.attemptsMade ?? 0;
    const teto = job?.opts.attempts ?? OPCOES_PADRAO.attempts ?? 1;
    const nivel = tentativa >= teto ? "[CRITICAL]" : "";
    console.error(
      `${nivel}[fila:publicacao] job ${job?.id} tentativa ${tentativa}/${teto} falhou:`,
      erro?.message
    );
  });

  console.log("[fila:publicacao] worker no ar (concorrencia 1, 3 tentativas).");
}
