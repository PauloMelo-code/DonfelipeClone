import { eq, isNull, lt, or, sql } from "drizzle-orm";
import { db, usuarios, codigosDeResgate, marcaDeExclusao, vivosE, type Usuario } from "@/lib/db";
import { cifrar, decifrar } from "@/lib/segredo-cifrado";
import { conferirCodigo, gerarSegredo, paraBase32, uriDeProvisionamento } from "@/lib/totp";
import { consumirCodigo, pareceCodigoDeResgate, substituirCodigos } from "@/lib/codigos-de-resgate";
import { revogarTodasDe } from "@/lib/sessoes";
import qrcode from "qrcode-generator";

// ---------------------------------------------------------------------------
// Segundo fator: o estado no banco.
//
// O calculo do codigo vive em `totp.ts`, puro e provado contra os vetores da
// RFC. Aqui fica o que precisa de banco: guardar a semente cifrada, ligar o
// fator, girar o autenticador e -- a parte que mais importa -- impedir REUSO
// de codigo com uma unica operacao condicional.
//
// Nada aqui tem "desligar o segundo fator". Girar o autenticador troca a
// semente e mantem o piso; zerar por acao administrativa devolve a conta ao
// estado de CADASTRO PENDENTE, que continua barrando tudo menos a propria
// tela de cadastro. Em nenhum dos dois a conta volta a viver so de senha.
// ---------------------------------------------------------------------------

/** Nome que aparece na lista do aplicativo autenticador. */
const EMISSOR = "Don Felipe Repasses";

/**
 * O QR como imagem pronta.
 *
 * Desenhado no SERVIDOR, e nao no navegador, para a biblioteca nao entrar no
 * pacote do cliente -- ela so e util nas duas telas de cadastro. Sai como
 * `data:` de GIF, que cabe num `<img src>` sem injetar marcacao na pagina.
 *
 * Correcao de erro `M`: o QR e lido da tela, nao de um papel amassado.
 */
function desenharQr(uri: string): string {
  const qr = qrcode(0, "M");
  qr.addData(uri);
  qr.make();
  return qr.createDataURL(6, 2);
}

export type MeioDoFator = "totp" | "resgate";

export interface VeredictoDoFator {
  ok: boolean;
  meio: MeioDoFator | null;
}

/** Campos que qualquer conferencia precisa. Menos que o `Usuario` inteiro. */
export type ContaComFator = Pick<
  Usuario,
  "id" | "totpSecret" | "totpEnabledAt" | "totpLastStep"
>;

/** A conta ainda precisa cadastrar o fator? */
export function precisaCadastrar(conta: Pick<Usuario, "totpEnabledAt">): boolean {
  return conta.totpEnabledAt === null;
}

/**
 * Marca o passo como gasto -- ou recusa, se ja estava.
 *
 * A trava de reuso e ESTE `UPDATE` condicional, e nao a comparacao em
 * memoria: duas requisicoes com o mesmo codigo chegando juntas leem o mesmo
 * `totp_last_step` e as duas passariam. Com o passo no WHERE, o banco decide
 * e so uma leva a linha.
 */
async function gastarPasso(userId: string, passo: number): Promise<boolean> {
  const [linha] = await db
    .update(usuarios)
    .set({ totpLastStep: passo })
    .where(
      vivosE(
        usuarios,
        eq(usuarios.id, userId),
        or(isNull(usuarios.totpLastStep), lt(usuarios.totpLastStep, passo))
      )
    )
    .returning({ id: usuarios.id });

  return Boolean(linha);
}

/**
 * O codigo digitado vale para esta conta?
 *
 * Aceita os dois meios pela FORMA do que foi digitado: seis digitos e o
 * aplicativo, dez caracteres e um codigo de resgate. Quem chama registra qual
 * dos dois entrou -- resgate usado e evento que merece alerta.
 *
 * Semente ilegivel (chave trocada, blob adulterado, linha copiada de outra
 * conta) e RECUSA, nunca "entao deixa passar sem fator".
 */
export async function conferirSegundoFator(
  conta: ContaComFator,
  codigo: string
): Promise<VeredictoDoFator> {
  if (pareceCodigoDeResgate(codigo)) {
    const gastou = await consumirCodigo(conta.id, codigo);
    return { ok: gastou, meio: gastou ? "resgate" : null };
  }

  if (!conta.totpSecret) return { ok: false, meio: null };

  let segredo: Buffer;
  try {
    segredo = decifrar(conta.totpSecret, conta.id);
  } catch (erro) {
    console.error("[CRITICAL][segundo-fator] semente ilegivel:", conta.id, erro);
    return { ok: false, meio: null };
  }

  const veredicto = conferirCodigo(segredo, codigo, {
    passoMinimo: conta.totpLastStep === null ? undefined : conta.totpLastStep + 1,
  });
  if (!veredicto.ok || veredicto.passo === null) return { ok: false, meio: null };

  const gastou = await gastarPasso(conta.id, veredicto.passo);
  return { ok: gastou, meio: gastou ? "totp" : null };
}

/**
 * A pessoa da sessao consegue provar o fator que ja tem?
 *
 * Existe porque quatro rotas precisam exatamente disto antes de mexer em
 * credencial: girar o autenticador, gerar codigos de resgate novos, cadastrar
 * uma passkey e remover uma. Copiar a busca em cada uma garantiria que a
 * proxima correcao chegasse so em tres.
 *
 * Devolve o MEIO usado, para a trilha registrar com o que foi autorizado.
 */
export async function provarFatorAtual(
  userId: string,
  codigo: string
): Promise<MeioDoFator | null> {
  const [conta] = await db
    .select({
      id: usuarios.id,
      totpSecret: usuarios.totpSecret,
      totpEnabledAt: usuarios.totpEnabledAt,
      totpLastStep: usuarios.totpLastStep,
    })
    .from(usuarios)
    .where(vivosE(usuarios, eq(usuarios.id, userId)))
    .limit(1);
  if (!conta) return null;

  const veredicto = await conferirSegundoFator(conta, codigo.trim());
  return veredicto.ok ? veredicto.meio : null;
}

export interface CadastroIniciado {
  /** O `otpauth://` do QR. */
  uri: string;
  /** O QR ja desenhado, como `data:` para um `<img>`. */
  qr: string;
  /** A mesma semente em base32, para quem digita a chave a mao. */
  chave: string;
}

/**
 * Comeca o cadastro: semente nova, guardada cifrada e AINDA NAO valendo.
 *
 * Enquanto `totpEnabledAt` for nulo a conta segue barrada. Isso e o que
 * permite chamar de novo quando a pessoa fecha a tela no meio: cada chamada
 * substitui a semente pendente, e nenhuma delas liga nada.
 *
 * Recusa reiniciar um fator que JA vale -- para esse caso existe `girar`, que
 * exige provar o fator atual. Sem essa recusa, um cookie roubado trocaria o
 * autenticador da vitima sem apresentar nada.
 */
export async function iniciarCadastro(
  userId: string,
  email: string
): Promise<CadastroIniciado> {
  const [conta] = await db
    .select({ totpEnabledAt: usuarios.totpEnabledAt })
    .from(usuarios)
    .where(vivosE(usuarios, eq(usuarios.id, userId)))
    .limit(1);
  if (!conta) throw new Error("Conta nao encontrada.");
  if (conta.totpEnabledAt !== null) {
    throw new Error("O segundo fator ja esta ativo nesta conta.");
  }

  const segredo = gerarSegredo();
  await db
    .update(usuarios)
    .set({ totpSecret: cifrar(segredo, userId), totpLastStep: null, updatedAt: new Date() })
    .where(vivosE(usuarios, eq(usuarios.id, userId)));

  const uri = uriDeProvisionamento(segredo, email, EMISSOR);
  return { uri, qr: desenharQr(uri), chave: paraBase32(segredo) };
}

export interface CadastroConcluido {
  /** Os codigos de resgate em claro. Aparecem uma vez e nunca mais. */
  codigos: string[];
}

/**
 * Confirma o cadastro com um codigo do aplicativo e LIGA o fator.
 *
 * Exigir o codigo aqui e o que impede a conta de ficar trancada por um QR que
 * a pessoa achou que escaneou: so liga quem provou que o autenticador
 * funciona.
 *
 * A geracao dos codigos de resgate entra na MESMA transacao. Ligar o fator sem
 * gravar os codigos deixaria a conta sem saida no primeiro celular perdido.
 */
export async function concluirCadastro(
  userId: string,
  codigo: string
): Promise<CadastroConcluido | null> {
  const [conta] = await db
    .select({
      id: usuarios.id,
      totpSecret: usuarios.totpSecret,
      totpEnabledAt: usuarios.totpEnabledAt,
      totpLastStep: usuarios.totpLastStep,
    })
    .from(usuarios)
    .where(vivosE(usuarios, eq(usuarios.id, userId)))
    .limit(1);

  if (!conta || !conta.totpSecret || conta.totpEnabledAt !== null) return null;

  let segredo: Buffer;
  try {
    segredo = decifrar(conta.totpSecret, conta.id);
  } catch {
    return null;
  }

  const veredicto = conferirCodigo(segredo, codigo);
  if (!veredicto.ok || veredicto.passo === null) return null;
  const passo = veredicto.passo;

  return db.transaction(async (tx) => {
    const [ligou] = await tx
      .update(usuarios)
      .set({
        totpEnabledAt: sql`now()`,
        totpLastStep: passo,
        updatedAt: new Date(),
      })
      // `totp_enabled_at IS NULL` no WHERE: duas confirmacoes simultaneas nao
      // geram dois conjuntos de codigos de resgate.
      .where(vivosE(usuarios, eq(usuarios.id, userId), isNull(usuarios.totpEnabledAt)))
      .returning({ id: usuarios.id });

    if (!ligou) return null;

    // A sessao que cadastrou tambem morre: quem acabou de ligar o fator entra
    // de novo apresentando o codigo, e isso prova o ciclo inteiro.
    await revogarTodasDe(userId, "fator-trocado", { executor: tx });

    return { codigos: await substituirCodigos(userId, tx) };
  });
}

/**
 * Gira o autenticador de quem JA tem o fator: semente nova, codigos novos.
 *
 * E o que a regua chama de "remover autenticador rotaciona, mantem o piso".
 * Quem chama e responsavel por exigir o fator atual antes -- caso contrario
 * isto vira o botao de desligar com outro nome.
 */
export async function girar(
  userId: string,
  email: string,
  executor: Pick<typeof db, "update" | "insert"> = db
): Promise<CadastroIniciado & { codigos: string[] }> {
  const segredo = gerarSegredo();

  await executor
    .update(usuarios)
    .set({
      totpSecret: cifrar(segredo, userId),
      totpEnabledAt: sql`now()`,
      totpLastStep: null,
      updatedAt: new Date(),
    })
    .where(vivosE(usuarios, eq(usuarios.id, userId)));

  // Autenticador novo derruba tudo o que estava aberto com o antigo.
  await revogarTodasDe(userId, "fator-trocado", { executor });

  const uri = uriDeProvisionamento(segredo, email, EMISSOR);
  return {
    uri,
    qr: desenharQr(uri),
    chave: paraBase32(segredo),
    codigos: await substituirCodigos(userId, executor),
  };
}

/**
 * Acao administrativa: devolve a conta ao estado de CADASTRO PENDENTE.
 *
 * Para o celular perdido com os codigos de resgate ja gastos. Note o que NAO
 * acontece: a conta nao volta a viver so de senha -- ela fica barrada em tudo
 * menos na propria tela de cadastro ate ligar um autenticador novo.
 */
export async function zerarFator(
  userId: string,
  atorId: string,
  executor: Pick<typeof db, "update"> = db
): Promise<void> {
  await executor
    .update(usuarios)
    .set({
      totpSecret: null,
      totpEnabledAt: null,
      totpLastStep: null,
      updatedAt: new Date(),
      modifiedBy: atorId,
    })
    .where(vivosE(usuarios, eq(usuarios.id, userId)));

  // E as sessoes abertas caem: a conta volta ao cadastro pendente, e uma aba
  // aberta em outro lugar nao pode continuar valendo como se nada tivesse
  // acontecido.
  await revogarTodasDe(userId, "fator-trocado", { executor });

  // Os codigos de resgate saem junto, por delete logico.
  //
  // Eles pertenciam a semente que acabou de deixar de existir. Deixados em pe,
  // sobreviveriam ao cadastro seguinte como uma segunda chave que o novo dono
  // do autenticador nunca viu.
  await executor
    .update(codigosDeResgate)
    .set(marcaDeExclusao(atorId))
    .where(vivosE(codigosDeResgate, eq(codigosDeResgate.userId, userId)));
}
