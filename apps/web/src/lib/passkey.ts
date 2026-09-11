import { and, eq, isNull, sql } from "drizzle-orm";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
  db,
  passkeys,
  desafiosWebauthn,
  marcaDeExclusao,
  vivos,
  vivosE,
  type Passkey,
} from "@/lib/db";

// ---------------------------------------------------------------------------
// Passkey (WebAuthn) -- o fator resistente a PHISHING.
//
// Por que aqui entra biblioteca e no TOTP nao: conferir uma passkey exige CBOR,
// ASN.1, chaves COSE e os formatos de atestacao (packed, tpm, apple, android,
// fido-u2f). Nao existe vetor de teste publicado que provasse uma
// implementacao propria, e uma falha de verificacao aqui e silenciosa -- o
// login continua funcionando enquanto aceita assinatura invalida. O TOTP tinha
// os vetores da RFC; este nao tem, e a conta muda.
//
// Duas regras que o servidor impoe e o navegador nao garante:
//
//   1. `userVerification: required` conferido NO SERVIDOR. O sinalizador UV vem
//      dentro dos dados assinados; exigir no pedido e so um pedido, e um
//      autenticador que ignore devolveria presenca sem verificacao nenhuma.
//   2. Dominio e origem vem da CONFIGURACAO, nunca da requisicao. Deduzir o
//      `rpID` do cabecalho `Host` devolveria ao atacante exatamente o que a
//      passkey existe para tirar dele.
// ---------------------------------------------------------------------------

/** Nome que aparece no pedido do sistema operacional. */
const NOME_DO_SISTEMA = "Don Felipe Repasses";

/** Validade do desafio. Curta: e um numero de uso unico, nao uma sessao. */
const MINUTOS_DO_DESAFIO = 5;

/**
 * Dominio e origem, lidos do ambiente.
 *
 * `rpID` e so o host, sem esquema nem porta -- e o que amarra a credencial ao
 * dominio. A origem e a URL completa e precisa bater exatamente.
 */
function configuracao(): { rpID: string; origem: string } {
  const bruto = process.env.NEXTAUTH_URL ?? "";
  if (!bruto) {
    throw new Error("[NEXTAUTH_URL] ausente: sem ela nao ha dominio para amarrar a passkey.");
  }
  const url = new URL(bruto);
  return { rpID: url.hostname, origem: url.origin };
}

export type TipoDeDesafio = "registro" | "login";

/** Guarda o desafio para conferir depois. Uso unico, com validade. */
async function guardarDesafio(
  challenge: string,
  tipo: TipoDeDesafio,
  userId: string | null,
  provaDoFator: string | null
): Promise<void> {
  await db.insert(desafiosWebauthn).values({
    challenge,
    tipo,
    userId,
    provaDoFator,
    expiresAt: sql`now() + interval '${sql.raw(String(MINUTOS_DO_DESAFIO))} minutes'`,
    modifiedBy: userId,
  });
}

/**
 * Gasta o desafio. Devolve a linha, ou null se ja foi usado ou venceu.
 *
 * `used_at IS NULL` esta no WHERE: duas requisicoes com o mesmo desafio
 * disputam a linha no banco e so uma leva. Ler-decidir-escrever deixaria as
 * duas passarem, e um desafio reaproveitavel e uma assinatura reaproveitavel.
 */
async function gastarDesafio(
  challenge: string,
  tipo: TipoDeDesafio
): Promise<{ userId: string | null; provaDoFator: string | null } | null> {
  const [linha] = await db
    .update(desafiosWebauthn)
    .set({ usedAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(
        vivos(desafiosWebauthn),
        eq(desafiosWebauthn.challenge, challenge),
        eq(desafiosWebauthn.tipo, tipo),
        isNull(desafiosWebauthn.usedAt),
        sql`${desafiosWebauthn.expiresAt} > now()`
      )
    )
    .returning({
      userId: desafiosWebauthn.userId,
      provaDoFator: desafiosWebauthn.provaDoFator,
    });

  return linha ?? null;
}

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

/**
 * O pedido que o navegador entrega ao autenticador.
 *
 * `residentKey: required` e o que torna a credencial DESCOBRIVEL, e e o que
 * permite a tela de login nao pedir e-mail nenhum antes. Sem isso, o servidor
 * teria de devolver a lista de credenciais de um e-mail -- e lista vazia
 * contra lista cheia enumera conta.
 *
 * `provaDoFator` e o meio pelo qual o dono provou quem e ao pedir este
 * desafio. Fica gravado junto: quem completa o cadastro completa o mesmo que
 * foi autorizado.
 */
export async function opcoesDeCadastro(
  usuario: { id: string; email: string; name: string },
  provaDoFator: string
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const { rpID } = configuracao();

  const jaCadastradas = await db
    .select({ credentialId: passkeys.credentialId, transports: passkeys.transports })
    .from(passkeys)
    .where(vivosE(passkeys, eq(passkeys.userId, usuario.id)));

  const opcoes = await generateRegistrationOptions({
    rpName: NOME_DO_SISTEMA,
    rpID,
    userName: usuario.email,
    userDisplayName: usuario.name,
    // O identificador que volta na assinatura. E o id da linha, opaco: nada
    // que descreva a pessoa deve viajar dentro do autenticador dela.
    userID: new TextEncoder().encode(usuario.id),
    attestationType: "none",
    // Impede cadastrar duas vezes o mesmo aparelho, que so confundiria na
    // hora de remover.
    excludeCredentials: jaCadastradas.map((p) => ({
      id: p.credentialId,
      transports: p.transports ? (p.transports.split(",") as never) : undefined,
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });

  await guardarDesafio(opcoes.challenge, "registro", usuario.id, provaDoFator);
  return opcoes;
}

export interface CadastroDePasskey {
  id: string;
  apelido: string;
}

/**
 * Confere o que o autenticador assinou e grava a credencial.
 *
 * Devolve null em qualquer recusa. Quem chama responde 400 sem detalhar: os
 * motivos de falha aqui (desafio vencido, origem errada, sem verificacao do
 * dono) nao ajudam quem esta do lado certo e ajudam quem nao esta.
 */
export async function concluirCadastro(
  userId: string,
  resposta: RegistrationResponseJSON,
  apelido: string
): Promise<CadastroDePasskey | null> {
  const { rpID, origem } = configuracao();

  const challenge = lerDesafioDoCliente(resposta?.response?.clientDataJSON);
  if (!challenge) return null;

  const desafio = await gastarDesafio(challenge, "registro");
  // O desafio pertence a esta conta? Sem esta linha, um desafio de registro de
  // outra pessoa serviria para pendurar a credencial na conta errada.
  if (!desafio || desafio.userId !== userId) return null;

  let veredicto;
  try {
    veredicto = await verifyRegistrationResponse({
      response: resposta,
      expectedChallenge: challenge,
      expectedOrigin: origem,
      expectedRPID: rpID,
      // O servidor EXIGE verificacao do dono (biometria ou PIN). Sem isto,
      // um aparelho desbloqueado na mesa vira a credencial de quem passar.
      requireUserVerification: true,
    });
  } catch (erro) {
    console.error("[passkey] cadastro recusado:", erro);
    return null;
  }

  if (!veredicto.verified || !veredicto.registrationInfo) return null;
  const { credential, credentialDeviceType, credentialBackedUp } = veredicto.registrationInfo;

  const [linha] = await db
    .insert(passkeys)
    .values({
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: credential.transports?.join(",") ?? null,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      apelido: apelido.trim().slice(0, 60) || "Passkey",
      modifiedBy: userId,
    })
    .returning({ id: passkeys.id, apelido: passkeys.apelido });

  return linha ?? null;
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

/**
 * O pedido de login. Sem lista de credenciais e sem e-mail.
 *
 * O autenticador oferece as contas que ele mesmo guarda, e o servidor so
 * descobre de quem e a conta depois de conferir a assinatura. E o que impede
 * este endereco, que e publico, de responder quem tem conta e quem nao tem.
 */
export async function opcoesDeLogin(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const { rpID } = configuracao();
  const opcoes = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
  });
  await guardarDesafio(opcoes.challenge, "login", null, null);
  return opcoes;
}

export interface EntradaPorPasskey {
  userId: string;
  passkeyId: string;
  apelido: string;
}

/**
 * Confere a assinatura e diz de quem e a conta.
 *
 * A ordem importa: o desafio e gasto ANTES da conferencia da assinatura.
 * Assim, uma tentativa que falhe tambem queima o desafio, e ninguem fica
 * martelando assinaturas contra o mesmo numero.
 */
export async function conferirLogin(
  resposta: AuthenticationResponseJSON
): Promise<EntradaPorPasskey | null> {
  const { rpID, origem } = configuracao();

  const challenge = lerDesafioDoCliente(resposta?.response?.clientDataJSON);
  if (!challenge) return null;

  const desafio = await gastarDesafio(challenge, "login");
  if (!desafio) return null;

  const [credencial] = await db
    .select()
    .from(passkeys)
    .where(vivosE(passkeys, eq(passkeys.credentialId, resposta.id)))
    .limit(1);
  if (!credencial) return null;

  let veredicto;
  try {
    veredicto = await verifyAuthenticationResponse({
      response: resposta,
      expectedChallenge: challenge,
      expectedOrigin: origem,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: credencial.credentialId,
        publicKey: new Uint8Array(Buffer.from(credencial.publicKey, "base64url")),
        counter: credencial.counter,
        transports: credencial.transports ? (credencial.transports.split(",") as never) : undefined,
      },
    });
  } catch (erro) {
    console.error("[passkey] login recusado:", erro);
    return null;
  }

  if (!veredicto.verified) return null;

  // O contador so anda para a frente. Ter voltado significa credencial
  // CLONADA em circulacao, e a biblioteca ja recusa antes de chegar aqui;
  // guardar o novo valor e o que mantem essa checagem util na proxima vez.
  await db
    .update(passkeys)
    .set({
      counter: veredicto.authenticationInfo.newCounter,
      lastUsedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(vivosE(passkeys, eq(passkeys.id, credencial.id)));

  return { userId: credencial.userId, passkeyId: credencial.id, apelido: credencial.apelido };
}

// ---------------------------------------------------------------------------
// Administracao das proprias passkeys
// ---------------------------------------------------------------------------

export type PasskeyNaTela = Pick<
  Passkey,
  "id" | "apelido" | "deviceType" | "backedUp" | "createdAt" | "lastUsedAt"
>;

export async function listar(userId: string): Promise<PasskeyNaTela[]> {
  return db
    .select({
      id: passkeys.id,
      apelido: passkeys.apelido,
      deviceType: passkeys.deviceType,
      backedUp: passkeys.backedUp,
      createdAt: passkeys.createdAt,
      lastUsedAt: passkeys.lastUsedAt,
    })
    .from(passkeys)
    .where(vivosE(passkeys, eq(passkeys.userId, userId)));
}

/**
 * Remove uma passkey do dono. Delete LOGICO.
 *
 * Nao ha risco de deixar a conta sem fator: o TOTP e o piso obrigatorio e
 * continua ligado. A passkey soma, nunca substitui.
 */
export async function remover(
  userId: string,
  passkeyId: string,
  executor: Pick<typeof db, "update"> = db
): Promise<boolean> {
  const [linha] = await executor
    .update(passkeys)
    .set(marcaDeExclusao(userId))
    .where(vivosE(passkeys, eq(passkeys.id, passkeyId), eq(passkeys.userId, userId)))
    .returning({ id: passkeys.id });
  return Boolean(linha);
}

/** A conta tem passkey? Usado pela tela de seguranca. */
export async function quantasTem(userId: string): Promise<number> {
  return (await listar(userId)).length;
}

/**
 * O desafio que o navegador realmente assinou, lido do `clientDataJSON`.
 *
 * E o valor assinado que vale, nunca um campo separado do corpo: conferir
 * contra o que o cliente disse ter usado, em vez do que ele assinou, deixaria
 * a conferencia inteira sem sentido.
 */
function lerDesafioDoCliente(clientDataJSON: string | undefined): string | null {
  if (!clientDataJSON) return null;
  try {
    const dados = JSON.parse(Buffer.from(clientDataJSON, "base64url").toString("utf8"));
    return typeof dados?.challenge === "string" ? dados.challenge : null;
  } catch {
    return null;
  }
}
