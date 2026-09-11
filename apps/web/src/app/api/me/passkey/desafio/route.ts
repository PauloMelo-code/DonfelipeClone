import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, usuarios, vivosE } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { provarFatorAtual } from "@/lib/segundo-fator";
import { opcoesDeCadastro } from "@/lib/passkey";
import { rateLimit } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Pede ao servidor o desafio para cadastrar uma passkey.
//
// Exige provar o fator ATUAL. Esta e a guarda que importa nesta rota: sem ela,
// um cookie roubado cadastraria o autenticador do atacante, e a partir dai ele
// entraria pela porta da frente com uma credencial que parece legitima -- e
// que sobrevive a troca de senha.
//
// O alvo e sempre a sessao corrente. A rota nao aceita `userId`.
// ---------------------------------------------------------------------------

const LIMITE_DE_CODIGO = { name: "2fa-codigo", maxRequests: 10, windowSeconds: 60 };

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  if (!rateLimit(LIMITE_DE_CODIGO, auth.user.id).allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde um minuto." },
      { status: 429 }
    );
  }

  try {
    const { codigo } = await request.json().catch(() => ({ codigo: undefined }));
    if (typeof codigo !== "string" || !codigo.trim()) {
      return NextResponse.json(
        { error: "Informe o codigo do aplicativo para confirmar que e voce." },
        { status: 400 }
      );
    }

    const prova = await provarFatorAtual(auth.user.id, codigo);
    if (!prova) {
      return NextResponse.json({ error: "Codigo invalido." }, { status: 400 });
    }

    const [conta] = await db
      .select({ id: usuarios.id, email: usuarios.email, name: usuarios.name })
      .from(usuarios)
      .where(vivosE(usuarios, eq(usuarios.id, auth.user.id)))
      .limit(1);
    if (!conta) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

    return NextResponse.json(await opcoesDeCadastro(conta, prova));
  } catch (erro) {
    console.error("[Me/passkey] desafio:", erro);
    return NextResponse.json({ error: "Erro ao preparar o cadastro" }, { status: 500 });
  }
}
