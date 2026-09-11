import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Segredo simetrico guardado no banco.
//
// A semente TOTP e o unico segredo desta base que NAO pode ser hasheado: o
// servidor precisa dela de volta para calcular o codigo. Entao ela e cifrada,
// e a chave mora no ambiente. Um dump do banco -- que e o que vaza -- devolve
// blobs inuteis em vez de segundos fatores funcionando.
//
// A cifra e autenticada (GCM) e amarrada ao DONO pelo dado associado. Sem
// isso, quem tivesse UPDATE no banco copiaria o proprio blob para a linha do
// administrador e entraria com o proprio celular. Amarrado, o mesmo blob na
// linha errada falha na verificacao da etiqueta.
// ---------------------------------------------------------------------------

const ALGORITMO = "aes-256-gcm";
const BYTES_DA_CHAVE = 32;
const BYTES_DO_IV = 12; // o tamanho que o GCM foi projetado para usar
const VERSAO = "v1";

let _chave: Buffer | null = null;

/**
 * A chave do ambiente.
 *
 * Deliberadamente NAO derivada do `NEXTAUTH_SECRET`: girar o segredo de sessao
 * e rotina, e se as duas fossem a mesma coisa, cada giro inutilizaria o
 * segundo fator de todo mundo de uma vez.
 */
function chave(): Buffer {
  if (_chave) return _chave;

  const bruto = process.env.TOTP_ENCRYPTION_KEY ?? "";
  if (!bruto) {
    throw new Error(
      "[TOTP_ENCRYPTION_KEY] ausente. Gere com: openssl rand -hex 32"
    );
  }

  const bytes = /^[0-9a-fA-F]+$/.test(bruto)
    ? Buffer.from(bruto, "hex")
    : Buffer.from(bruto, "base64");

  if (bytes.length !== BYTES_DA_CHAVE) {
    throw new Error(
      `[TOTP_ENCRYPTION_KEY] precisa de ${BYTES_DA_CHAVE} bytes (openssl rand -hex 32); recebeu ${bytes.length}.`
    );
  }

  _chave = bytes;
  return _chave;
}

/** A chave esta configurada? Usado so para falhar cedo, nunca para pular a cifra. */
export function chaveConfigurada(): boolean {
  try {
    chave();
    return true;
  } catch {
    return false;
  }
}

/**
 * Cifra amarrada a `contexto` (o id do dono).
 *
 * Sai como texto para caber numa coluna `text`: versao, IV, etiqueta e dado,
 * separados por ponto. A versao existe para o dia da troca de algoritmo --
 * sem ela, migrar exige adivinhar o formato de cada linha.
 */
export function cifrar(claro: Buffer, contexto: string): string {
  const iv = randomBytes(BYTES_DO_IV);
  const cifra = createCipheriv(ALGORITMO, chave(), iv);
  cifra.setAAD(Buffer.from(contexto, "utf8"));
  const dado = Buffer.concat([cifra.update(claro), cifra.final()]);
  return [
    VERSAO,
    iv.toString("base64url"),
    cifra.getAuthTag().toString("base64url"),
    dado.toString("base64url"),
  ].join(".");
}

/**
 * Decifra e CONFERE a etiqueta. Blob adulterado ou de outro dono lanca.
 *
 * Quem chama trata a excecao como "sem segundo fator utilizavel" e recusa o
 * login -- nunca como "entao deixa passar sem fator".
 */
export function decifrar(guardado: string, contexto: string): Buffer {
  const partes = guardado.split(".");
  if (partes.length !== 4 || partes[0] !== VERSAO) {
    throw new Error("Segredo cifrado em formato desconhecido.");
  }
  const [, iv, etiqueta, dado] = partes;

  const decifra = createDecipheriv(ALGORITMO, chave(), Buffer.from(iv, "base64url"));
  decifra.setAAD(Buffer.from(contexto, "utf8"));
  decifra.setAuthTag(Buffer.from(etiqueta, "base64url"));
  return Buffer.concat([decifra.update(Buffer.from(dado, "base64url")), decifra.final()]);
}
