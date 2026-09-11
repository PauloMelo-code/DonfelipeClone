import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// TOTP (RFC 6238) sobre HOTP (RFC 4226).
//
// Sem dependencia: o algoritmo inteiro e um HMAC, um truncamento e um resto de
// divisao. O que justifica escrever em vez de instalar e que a RFC publica
// VETORES DE TESTE oficiais -- `tests/totp.test.ts` roda os seis, mais os de
// SHA-256 e SHA-512. Uma implementacao que passa nos vetores da norma esta
// certa; uma dependencia a mais na cadeia do login nao teria essa prova.
//
// Este arquivo e PURO: nao toca banco, nao le ambiente, nao registra nada. E
// o que o torna testavel contra a norma sem subir nada.
// ---------------------------------------------------------------------------

/** Duracao de um passo. 30 s e o que todo aplicativo autenticador assume. */
export const PASSO_SEGUNDOS = 30;
/** Digitos do codigo. 6 e o padrao dos aplicativos. */
export const DIGITOS = 6;
/**
 * Passos aceitos para cada lado do atual.
 *
 * 1 = tolera 30 s de relogio torto no celular. Cada passo a mais multiplica
 * por dois as chances de um chute cego, entao isto nao cresce "para ajudar
 * quem digita devagar".
 */
export const TOLERANCIA_DE_PASSOS = 1;

/** Bytes do segredo. 20 e o tamanho do SHA-1, e o que os aplicativos esperam. */
export const BYTES_DO_SEGREDO = 20;

const ALFABETO_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Base32 da RFC 4648, que e o formato que o `otpauth://` carrega. */
export function paraBase32(bytes: Buffer): string {
  let bits = 0;
  let valor = 0;
  let saida = "";
  for (const byte of bytes) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO_BASE32[(valor << (5 - bits)) & 31];
  return saida;
}

/**
 * Le base32 de volta para bytes.
 *
 * Tolera minuscula, espaco e o `=` de preenchimento porque o usuario digita
 * a chave a mao quando o aplicativo nao le o QR. Caractere fora do alfabeto e
 * erro, nunca zero silencioso: um segredo lido errado gera codigo errado para
 * sempre, e o defeito so apareceria no primeiro login.
 */
export function deBase32(texto: string): Buffer {
  const limpo = texto.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const caractere of limpo) {
    const indice = ALFABETO_BASE32.indexOf(caractere);
    if (indice < 0) throw new Error("Chave invalida: caractere fora do base32.");
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Segredo novo, do CSPRNG do sistema. */
export function gerarSegredo(): Buffer {
  return randomBytes(BYTES_DO_SEGREDO);
}

/** O passo em que um instante cai. E o contador do HOTP. */
export function passoDoInstante(agora: Date = new Date()): number {
  return Math.floor(agora.getTime() / 1000 / PASSO_SEGUNDOS);
}

/**
 * HOTP: o codigo de um passo (RFC 4226, secao 5.3).
 *
 * O `sha1` aqui e HMAC-SHA1, e nao SHA-1 como resumo de colisao -- e o que a
 * RFC 6238 usa por padrao e o unico que todo aplicativo autenticador aceita.
 * As colisoes que quebraram o SHA-1 nao atingem o HMAC.
 */
export function codigoNoPasso(
  segredo: Buffer,
  passo: number,
  digitos: number = DIGITOS,
  algoritmo: "sha1" | "sha256" | "sha512" = "sha1"
): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));

  const mac = createHmac(algoritmo, segredo).update(contador).digest();

  // Truncamento dinamico: os 4 ultimos bits dizem de onde tirar os 4 bytes.
  const deslocamento = mac[mac.length - 1] & 0x0f;
  const numero =
    ((mac[deslocamento] & 0x7f) << 24) |
    ((mac[deslocamento + 1] & 0xff) << 16) |
    ((mac[deslocamento + 2] & 0xff) << 8) |
    (mac[deslocamento + 3] & 0xff);

  return String(numero % 10 ** digitos).padStart(digitos, "0");
}

export interface VeredictoDoCodigo {
  ok: boolean;
  /** O passo que casou. Quem chama guarda para barrar reuso. */
  passo: number | null;
}

export interface OpcoesDeConferencia {
  agora?: Date;
  /**
   * Menor passo ainda aceitavel.
   *
   * E a trava de REUSO: quem chama passa `ultimoPassoUsado + 1`. Sem isto o
   * mesmo codigo de seis digitos serve duas vezes dentro da janela, e um
   * codigo lido por cima do ombro (ou capturado numa tela de phishing) entra
   * de novo enquanto o passo nao virar.
   */
  passoMinimo?: number;
  digitos?: number;
}

/**
 * O codigo digitado vale agora?
 *
 * Varre a janela inteira SEM sair no primeiro acerto e compara em tempo
 * constante. Sair cedo revelaria pelo relogio qual passo casou; nao e o
 * segredo, mas e informacao de graca para quem esta medindo.
 */
export function conferirCodigo(
  segredo: Buffer,
  codigo: string,
  opcoes: OpcoesDeConferencia = {}
): VeredictoDoCodigo {
  const digitos = opcoes.digitos ?? DIGITOS;
  const digitado = (codigo ?? "").replace(/[\s-]/g, "");
  if (digitado.length !== digitos || !/^\d+$/.test(digitado)) {
    return { ok: false, passo: null };
  }

  const atual = passoDoInstante(opcoes.agora);
  const minimo = opcoes.passoMinimo ?? Number.NEGATIVE_INFINITY;

  const digitadoBytes = Buffer.from(digitado, "utf8");
  let passoAceito: number | null = null;

  for (let delta = -TOLERANCIA_DE_PASSOS; delta <= TOLERANCIA_DE_PASSOS; delta++) {
    const passo = atual + delta;
    const esperado = Buffer.from(codigoNoPasso(segredo, passo, digitos), "utf8");
    const igual = timingSafeEqual(esperado, digitadoBytes);
    // Sem `break`: a varredura custa tres HMAC e nao vaza qual passo casou.
    if (igual && passo >= minimo && passoAceito === null) passoAceito = passo;
  }

  return { ok: passoAceito !== null, passo: passoAceito };
}

/**
 * O `otpauth://` que o QR carrega.
 *
 * O rotulo leva emissor e conta porque e o que aparece na lista do aplicativo:
 * sem ele, quem tem duas contas ve duas linhas iguais e nao sabe qual e qual.
 */
export function uriDeProvisionamento(
  segredo: Buffer,
  conta: string,
  emissor: string
): string {
  const rotulo = encodeURIComponent(`${emissor}:${conta}`);
  const parametros = new URLSearchParams({
    secret: paraBase32(segredo),
    issuer: emissor,
    algorithm: "SHA1",
    digits: String(DIGITOS),
    period: String(PASSO_SEGUNDOS),
  });
  return `otpauth://totp/${rotulo}?${parametros.toString()}`;
}
