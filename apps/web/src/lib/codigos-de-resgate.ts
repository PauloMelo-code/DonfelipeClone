import { createHash, randomInt } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, codigosDeResgate, marcaDeExclusao, vivos, vivosE } from "@/lib/db";

// ---------------------------------------------------------------------------
// Codigos de resgate do segundo fator.
//
// Sao a saida para o celular perdido. Sem eles, um fator obrigatorio vira
// conta perdida, e a pressa de recuperar acaba produzindo um botao de
// "desligar o segundo fator" -- que e exatamente a porta que a regua proibe.
//
// Guardados como SHA-256. Hash rapido e o certo aqui: o codigo vem de CSPRNG
// com 50 bits de entropia, entao nao existe dicionario a defender, e a busca
// pelo hash exato e o que permite consumir em UMA operacao atomica.
// ---------------------------------------------------------------------------

/** Quantos codigos por conta. */
export const QUANTIDADE = 10;
/** Caracteres por codigo. 10 x 5 bits = 50 bits de entropia. */
const COMPRIMENTO = 10;

/**
 * Base32 de Crockford: sem I, L, O e U.
 *
 * O codigo e lido de um papel e digitado a mao. `0`/`O` e `1`/`I` trocados na
 * transcricao viram "codigo invalido" numa hora em que a pessoa ja perdeu o
 * celular -- o alfabeto resolve isso antes de acontecer.
 */
const ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Normaliza o que a pessoa digitou.
 *
 * Aceita minuscula, hifen e espaco, e aplica as substituicoes de Crockford
 * (`O`->`0`, `I`/`L`->`1`, `U`->`V`) pelo mesmo motivo do alfabeto.
 */
export function normalizar(codigo: string): string {
  return (codigo ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
}

/** O que vai para o banco. O codigo em claro so existe na tela, uma vez. */
export function hashDoCodigo(codigo: string): string {
  return createHash("sha256").update(normalizar(codigo), "utf8").digest("hex");
}

/** Tem cara de codigo de resgate (e nao de codigo de seis digitos do app)? */
export function pareceCodigoDeResgate(codigo: string): boolean {
  return normalizar(codigo).length === COMPRIMENTO;
}

/** Um codigo novo, do CSPRNG. `randomInt` nao tem o vies do `% alfabeto`. */
function gerarUm(): string {
  let saida = "";
  for (let i = 0; i < COMPRIMENTO; i++) saida += ALFABETO[randomInt(ALFABETO.length)];
  return saida;
}

/** Como o codigo aparece na tela: dois blocos de cinco. */
export function formatar(codigo: string): string {
  return `${codigo.slice(0, 5)}-${codigo.slice(5)}`;
}

/**
 * Troca o conjunto inteiro e devolve os codigos EM CLARO, uma unica vez.
 *
 * Os antigos saem por delete logico, nunca por `DELETE`: a linha gasta e a
 * prova de que aquele codigo foi usado, e apagar destroi a prova.
 *
 * Aceita transacao porque quem gera os codigos costuma estar ligando ou
 * girando o fator na mesma operacao -- as duas coisas vivem ou morrem juntas.
 */
export async function substituirCodigos(
  userId: string,
  executor: Pick<typeof db, "insert" | "update"> = db
): Promise<string[]> {
  const claros = Array.from({ length: QUANTIDADE }, gerarUm);

  await executor
    .update(codigosDeResgate)
    .set(marcaDeExclusao(userId))
    .where(vivosE(codigosDeResgate, eq(codigosDeResgate.userId, userId)));

  await executor.insert(codigosDeResgate).values(
    claros.map((codigo) => ({
      userId,
      codeHash: hashDoCodigo(codigo),
      modifiedBy: userId,
    }))
  );

  return claros.map(formatar);
}

/**
 * Gasta um codigo. Devolve se valeu.
 *
 * Um `UPDATE` condicional: `used_at IS NULL` esta no WHERE, entao duas
 * requisicoes simultaneas com o mesmo codigo disputam a linha no banco e so
 * uma leva. Ler-decidir-escrever deixaria as duas passarem.
 */
export async function consumirCodigo(userId: string, codigo: string): Promise<boolean> {
  if (!pareceCodigoDeResgate(codigo)) return false;

  const [linha] = await db
    .update(codigosDeResgate)
    .set({ usedAt: sql`now()`, updatedAt: sql`now()`, modifiedBy: userId })
    .where(
      and(
        vivos(codigosDeResgate),
        eq(codigosDeResgate.userId, userId),
        eq(codigosDeResgate.codeHash, hashDoCodigo(codigo)),
        isNull(codigosDeResgate.usedAt)
      )
    )
    .returning({ id: codigosDeResgate.id });

  return Boolean(linha);
}

/** Quantos ainda restam. A tela avisa quando estao acabando. */
export async function quantosRestam(userId: string): Promise<number> {
  const linhas = await db
    .select({ id: codigosDeResgate.id })
    .from(codigosDeResgate)
    .where(
      and(
        vivos(codigosDeResgate),
        eq(codigosDeResgate.userId, userId),
        isNull(codigosDeResgate.usedAt)
      )
    );
  return linhas.length;
}
