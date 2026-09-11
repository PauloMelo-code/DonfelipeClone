import { AuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usuarios, vivosE } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { metaDeCabecalhos } from "@/lib/request-meta";
import { TAMANHO_MAXIMO_BRUTO } from "@/lib/validators/password";
import { estaTravada, limparFalhas, registrarFalha } from "@/lib/bloqueio-de-conta";
import { conferirSegundoFator, precisaCadastrar } from "@/lib/segundo-fator";
import { temporariaVencida } from "@/lib/guardas/usuarios";
import { entrarPorPasskey } from "@/lib/login/entrada-por-passkey";
import { HORAS_DE_VIDA, abrirSessao, carregarSessao, revogar, tocar } from "@/lib/sessoes";
import { hashIsca, recusar } from "@/lib/login/recusa";
import {
  registrarBloqueio,
  registrarEntrada,
  registrarSaida,
  type MeioDaEntrada,
} from "@/lib/trilha-de-login";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "OPERATOR";
}

export type AuthResult =
  /** `sessaoId` e a linha de `users_sessions` desta requisicao. A tela de
   *  seguranca usa para marcar "esta e a sua sessao". */
  | { success: true; user: AuthUser; sessaoId: string }
  | { success: false; response: NextResponse };

// ---------------------------------------------------------------------------
// Rate limit configs
// ---------------------------------------------------------------------------

const LOGIN_LIMITER = { name: "login", maxRequests: 5, windowSeconds: 60 };
const API_LIMITER = { name: "api", maxRequests: 60, windowSeconds: 60 };

/** Grita uma vez por processo, e nao a cada tentativa. */
let jaAvisouDaOrigem = false;

/**
 * A chave do limitador quando nao da para saber de onde veio.
 *
 * Todo mundo cai no MESMO balde, de proposito. A alternativa seria confiar no
 * que o cliente escreveu, e ai cada atacante ganha o balde dele -- que era
 * exatamente o defeito. Um balde compartilhado aperta demais e aparece rapido;
 * um balde por cabecalho inventado nao aperta nunca e nao aparece nunca.
 *
 * O aviso e CRITICAL porque a causa quase sempre e configuracao: sem proxy na
 * frente, ou `TRUSTED_PROXY_HOPS` diferente da topologia real.
 */
function chaveDoLimitador(ip: string | null): string {
  if (ip) return ip;
  if (!jaAvisouDaOrigem) {
    jaAvisouDaOrigem = true;
    console.error(
      "[CRITICAL][login] origem desconhecida: o limitador por IP virou um balde unico. " +
        "Confira se ha proxy na frente e se TRUSTED_PROXY_HOPS bate com a topologia."
    );
  }
  return "origem-desconhecida";
}

// ---------------------------------------------------------------------------
// NextAuth configuration
// ---------------------------------------------------------------------------

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
        // O segundo fator viaja no MESMO pedido, de proposito.
        //
        // A alternativa -- confirmar a senha e so entao pedir o codigo -- cria
        // uma resposta intermediaria que responde "esta senha esta certa" a
        // quem ainda nao entrou. Com os tres campos de uma vez, toda recusa
        // continua sendo a mesma recusa, que e a regra que segura o resto.
        codigo: { label: "Codigo do autenticador", type: "text" },
        // A resposta assinada pelo autenticador, em JSON.
        //
        // Entra pelo MESMO provider de propósito. O funil de sessao e um so:
        // bloqueio por conta, piso de tempo e trilha valem para a passkey sem
        // que nada precise ser repetido. Um provider proprio seria um segundo
        // caminho de login, e caminho esquecido e o que vira brecha.
        passkey: { label: "Passkey", type: "text" },
      },
      async authorize(credentials, req) {
        const inicio = Date.now();

        // A origem sai da leitura CANONICA, a mesma do resto do sistema.
        //
        // Aqui havia uma copia que pegava o `x-forwarded-for` cru, sem sequer
        // separar a lista: rodar o cabecalho a cada tentativa dava um balde
        // novo no limitador, e o teto por IP nao existia na pratica.
        //
        // Ele continua sendo a SEGUNDA linha. A que importa e o bloqueio por
        // CONTA, logo abaixo, que nao depende de identificar a origem.
        const { ipAddress, userAgent } = metaDeCabecalhos(req?.headers);
        const origem = { ip: ipAddress, userAgent };

        const email = credentials?.email ?? null;
        const senha = credentials?.password;

        if (!rateLimit(LOGIN_LIMITER, chaveDoLimitador(ipAddress)).allowed) {
          return recusar(inicio, { motivo: "limite_por_ip", email, ...origem });
        }

        // ---- Passkey: caminho proprio, sem senha ----------------------
        //
        // Nao falta um fator aqui. A passkey ja e posse do autenticador MAIS
        // a biometria ou o PIN que o servidor exige (`userVerification`), e a
        // assinatura e feita sobre o dominio de quem pediu -- por isso uma
        // tela falsa nao consegue reaproveita-la, coisa que a senha e o
        // codigo de seis digitos nao impedem.
        const assinatura = credentials?.passkey;
        if (assinatura) {
          return entrarPorPasskey(inicio, assinatura, origem);
        }

        if (!email || !senha) {
          return recusar(inicio, { motivo: "entrada_malformada", email, ...origem });
        }
        // Teto bruto ANTES do KDF: sem ele, um corpo de megabytes vira
        // trabalho de bcrypt e derruba o processo.
        if (senha.length > TAMANHO_MAXIMO_BRUTO) {
          return recusar(inicio, { motivo: "entrada_malformada", email, ...origem });
        }

        const [user] = await db
          .select()
          .from(usuarios)
          .where(vivosE(usuarios, eq(usuarios.email, email)))
          .limit(1);

        // Conta travada: recusa ANTES do KDF e SEM contar nova falha.
        //
        // Sem esta segunda parte o atacante estende o bloqueio indefinidamente
        // e o dono nunca reentra -- o bloqueio viraria a negacao de servico que
        // deveria impedir. O piso de tempo abaixo cuida de a resposta continuar
        // indistinguivel das demais.
        if (user && estaTravada(user).travada) {
          return recusar(inicio, {
            motivo: "conta_travada",
            email,
            userId: user.id,
            ...origem,
          });
        }

        // O KDF roda SEMPRE, inclusive para e-mail inexistente.
        const senhaConfere = await bcrypt.compare(senha, user?.password ?? hashIsca());

        if (!user) {
          return recusar(inicio, { motivo: "credencial_invalida", email, ...origem });
        }
        if (!senhaConfere) {
          // A falha conta na conta certa, com o contador do proprio banco.
          const estado = await registrarFalha(user.id);
          if (estado.travada && estado.ate) {
            void registrarBloqueio({
              userId: user.id, email, ate: estado.ate, falhas: estado.falhas, ...origem,
            });
          }
          return recusar(inicio, {
            motivo: "credencial_invalida", email, userId: user.id, ...origem,
          });
        }
        if (!user.active) {
          return recusar(inicio, {
            motivo: "conta_desativada", email, userId: user.id, ...origem,
          });
        }

        // Senha temporaria VENCIDA: a credencial que um administrador definiu
        // tem prazo proprio, porque a marca `must_change_password` so agiria
        // se o login acontecesse -- e o caso perigoso e justamente a conta
        // provisionada, nunca usada, cuja senha ficou numa conversa.
        if (temporariaVencida(user)) {
          return recusar(inicio, {
            motivo: "senha_temporaria_vencida", email, userId: user.id, ...origem,
          });
        }

        // ---- Segundo fator --------------------------------------------
        //
        // Senha certa ainda nao e sessao. Conta que ja cadastrou o
        // autenticador so entra apresentando o codigo (ou um codigo de
        // resgate); conta que ainda nao cadastrou entra numa sessao que so
        // alcanca a propria tela de cadastro -- ver `conferirSessao`.
        let meio: MeioDaEntrada = "senha";
        if (!precisaCadastrar(user)) {
          const codigo = (credentials?.codigo ?? "").trim();

          // Codigo em branco e formulario incompleto, nao tentativa: nao
          // conta falha. Como a recusa e identica a de senha errada, quem
          // esta sondando nao aprende nada com isso -- e quem so esqueceu de
          // digitar nao tem a conta travada por esquecimento.
          if (!codigo) {
            return recusar(inicio, {
              motivo: "segundo_fator_invalido", email, userId: user.id, ...origem,
            });
          }

          const fator = await conferirSegundoFator(user, codigo);
          if (!fator.ok) {
            // Codigo errado CONTA no bloqueio da conta. Sem isto, seis digitos
            // sao um milhao de tentativas sem nenhum teto -- o fator viraria
            // enfeite contra quem ja tem a senha.
            const estado = await registrarFalha(user.id);
            if (estado.travada && estado.ate) {
              void registrarBloqueio({
                userId: user.id, email, ate: estado.ate, falhas: estado.falhas, ...origem,
              });
            }
            return recusar(inicio, {
              motivo: "segundo_fator_invalido", email, userId: user.id, ...origem,
            });
          }
          meio = fator.meio === "resgate" ? "senha+resgate" : "senha+totp";
        }

        // Entrou: a sequencia de falhas morre aqui.
        await limparFalhas(user.id);
        void registrarEntrada({ userId: user.id, email: user.email, meio, ...origem });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as "ADMIN" | "OPERATOR",
          // A sessao nasce AQUI, no funil, e o cookie so leva o id dela.
          sessionId: await abrirSessao(user.id, origem),
        } as AuthUser & { sessionId: string };
      },
    }),
  ],
  // O cookie vence junto com o teto absoluto da linha no banco. Amarrado a
  // mesma constante para os dois nao poderem divergir.
  session: { strategy: "jwt", maxAge: HORAS_DE_VIDA * 60 * 60 },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.role = (user as any).role;
        token.id = user.id;
        // O ponteiro para a linha de `users_sessions`. E a unica coisa de
        // sessao que o cookie carrega -- o resto e lido do banco a cada
        // requisicao.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.sid = (user as any).sessionId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as Record<string, unknown>).role = token.role;
        (session.user as Record<string, unknown>).id = token.id;
        // A tela de seguranca precisa dele para marcar "esta e a sua sessao".
        // Nao e credencial: sem o cookie assinado, o id nao abre nada.
        (session.user as Record<string, unknown>).sid = token.sid ?? null;
      }
      return session;
    },
  },
  events: {
    /**
     * Sair encerra a linha, e nao so o cookie.
     *
     * Sem isto, "sair" apagaria o cookie do navegador e deixaria a sessao viva
     * no banco -- uma copia do cookie feita antes continuaria entrando, e a
     * lista de sessoes mentiria para o dono.
     */
    async signOut({ token }) {
      const sid = (token as { sid?: string })?.sid;
      const userId = (token as { id?: string })?.id;
      if (!sid || !userId) return;
      if (await revogar(sid, userId, "logout")) {
        await registrarSaida({ userId, sessaoId: sid, motivo: "logout" });
      }
    },
  },
  pages: { signIn: "/login", error: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
};

// ---------------------------------------------------------------------------
// requireAuth() — call at the top of every API route handler
// ---------------------------------------------------------------------------

/**
 * Guarda padrao de toda rota autenticada.
 *
 * Barra a conta com senha temporaria: enquanto o dono nao escolher a dele, a
 * sessao so serve para trocar a senha.
 */
export async function requireAuth(
  ...allowedRoles: ("ADMIN" | "OPERATOR")[]
): Promise<AuthResult> {
  return conferirSessao(allowedRoles, null);
}

/**
 * As duas UNICAS excecoes aos portoes de conta pendente.
 *
 * A lista e branca e por CHAMADOR, em vez de adivinhar a rota pelo framework:
 * quem precisa da excecao pede por ela, e toda excecao aparece num `grep`.
 */
type Excecao = "senha-temporaria" | "cadastro-de-fator";

/**
 * Aceita conta com senha temporaria. Usada so por `POST /api/me/password`.
 *
 * Passa tambem pelo portao do fator: quem tem senha temporaria E fator
 * pendente precisa comecar pela senha, senao os dois portoes se travam um ao
 * outro e a conta nao alcanca nenhum dos dois.
 */
export async function requireSessaoParaTrocarSenha(): Promise<AuthResult> {
  return conferirSessao([], "senha-temporaria");
}

/**
 * Aceita conta sem segundo fator cadastrado. Usada so pelas rotas de
 * `/api/me/2fa`.
 *
 * NAO dispensa o portao da senha temporaria: a ordem e senha primeiro, fator
 * depois. Cadastrar o autenticador de uma conta cuja senha ainda e a que
 * outra pessoa escolheu amarraria o fator ao dono errado.
 */
export async function requireSessaoParaCadastrarFator(): Promise<AuthResult> {
  return conferirSessao([], "cadastro-de-fator");
}

async function conferirSessao(
  allowedRoles: ("ADMIN" | "OPERATOR")[],
  excecao: Excecao | null
): Promise<AuthResult> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Nao autenticado" },
        { status: 401 }
      ),
    };
  }

  const daSessao = session.user as AuthUser;

  // API rate limit per user
  const rl = rateLimit(API_LIMITER, daSessao.id);
  if (!rl.allowed) {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Limite de requisicoes excedido. Aguarde." },
        { status: 429 }
      ),
    };
  }

  // A SESSAO e a conta vem do banco, nunca do token.
  //
  // Uma consulta so responde tudo o que o token nao consegue responder: a
  // sessao foi encerrada? venceu o teto de 24 h? ficou uma hora em silencio?
  // e o papel, e o `active`, mudaram desde o login? Enquanto isso morava no
  // JWT, desligar alguem ou rebaixar um ADMIN so valia quando o token
  // vencesse -- ate um dia inteiro depois.
  //
  // ponytail: uma consulta por requisicao, sem cache. Se virar gargalo, cache
  // curto por sessaoId — depois de medir, nao antes.
  const sessaoId = (daSessao as unknown as { sid?: string }).sid;
  const atual = sessaoId ? await carregarSessao(sessaoId) : null;

  if (!atual || !atual.active) {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Nao autenticado" },
        { status: 401 }
      ),
    };
  }

  // Marca atividade. Condicional la dentro: so escreve quando o carimbo ja
  // esta velho, senao toda requisicao viraria uma escrita.
  if (atual.precisaTocar) await tocar(atual.sessaoId);

  const user: AuthUser = {
    id: atual.id,
    email: atual.email,
    name: atual.name,
    role: atual.role as "ADMIN" | "OPERATOR",
  };

  // Senha temporaria, definida por um administrador: a conta so alcanca a
  // troca da propria senha ate que o dono escolha a dele.
  //
  // O portao vive AQUI, e nao num banner de tela: Server Action e rota de API
  // nao passam por layout nenhum, e um aviso visual nao barra `curl`. A propria
  // rota de troca fica de fora, senao o ciclo nunca fecha.
  if (atual.mustChangePassword && excecao !== "senha-temporaria") {
    return {
      success: false,
      response: NextResponse.json(
        {
          error: "Senha temporaria: troque a sua senha para continuar.",
          mustChangePassword: true,
        },
        { status: 403 }
      ),
    };
  }

  // Segundo fator pendente: a sessao existe, mas so alcanca o proprio
  // cadastro do autenticador.
  //
  // Mesmo motivo do portao acima: Server Action e rota de API nao passam por
  // layout nenhum, entao um aviso de tela nao barra `curl`. E o que faz o
  // fator ser OBRIGATORIO em vez de recomendado -- sem este portao, quem
  // nunca cadastrasse seguiria usando o sistema so com a senha.
  if (precisaCadastrar(atual) && excecao === null) {
    return {
      success: false,
      response: NextResponse.json(
        {
          error: "Cadastre o segundo fator para continuar.",
          mustEnrollTotp: true,
        },
        { status: 403 }
      ),
    };
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Acesso negado" },
        { status: 403 }
      ),
    };
  }

  return { success: true, user, sessaoId: atual.sessaoId };
}
