import { AuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

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
  | { success: true; user: AuthUser }
  | { success: false; response: NextResponse };

// ---------------------------------------------------------------------------
// Rate limit configs
// ---------------------------------------------------------------------------

const LOGIN_LIMITER = { name: "login", maxRequests: 5, windowSeconds: 60 };
const API_LIMITER = { name: "api", maxRequests: 60, windowSeconds: 60 };

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
      },
      async authorize(credentials, req) {
        // Rate limit login attempts by IP
        const forwarded = req?.headers?.["x-forwarded-for"];
        const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded) || "unknown";
        const rl = rateLimit(LOGIN_LIMITER, ip);
        if (!rl.allowed) {
          throw new Error("Muitas tentativas. Aguarde 1 minuto.");
        }

        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email e senha sao obrigatorios");
        }
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });
        if (!user || !user.active) {
          throw new Error("Usuario nao encontrado ou inativo");
        }
        const isValid = await bcrypt.compare(
          credentials.password,
          user.password
        );
        if (!isValid) {
          throw new Error("Senha incorreta");
        }
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as "ADMIN" | "OPERATOR",
        };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 24 * 60 * 60 },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.role = (user as any).role;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as Record<string, unknown>).role = token.role;
        (session.user as Record<string, unknown>).id = token.id;
      }
      return session;
    },
  },
  pages: { signIn: "/login", error: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
};

// ---------------------------------------------------------------------------
// requireAuth() — call at the top of every API route handler
// ---------------------------------------------------------------------------

export async function requireAuth(
  ...allowedRoles: ("ADMIN" | "OPERATOR")[]
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

  const user = session.user as AuthUser;

  // API rate limit per user
  const rl = rateLimit(API_LIMITER, user.id);
  if (!rl.allowed) {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Limite de requisicoes excedido. Aguarde." },
        { status: 429 }
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

  return { success: true, user };
}
