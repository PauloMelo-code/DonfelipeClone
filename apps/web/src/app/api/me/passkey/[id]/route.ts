import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { provarFatorAtual } from "@/lib/segundo-fator";
import { remover } from "@/lib/passkey";
import { registrarAuditoriaObrigatoria } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Remove uma passkey do dono.
//
// Delete LOGICO, e com o fator atual provado -- a remocao e tao sensivel
// quanto o cadastro: quem tirasse a passkey de alguem rebaixaria a conta ao
// codigo de seis digitos, que e o que o phishing ainda alcanca.
//
// A conta nao fica sem fator: o TOTP e o piso obrigatorio e continua ligado.
// A passkey soma, nunca substitui.
//
// A trilha vai ANTES e e fail-closed: sumida a linha, ninguem prova depois
// qual credencial existia ali.
// ---------------------------------------------------------------------------

const LIMITE_DE_CODIGO = { name: "2fa-codigo", maxRequests: 10, windowSeconds: 60 };

/** Sinaliza "nao era desta conta" de dentro da transacao, para desfaze-la. */
class NaoEncontrada extends Error {}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  if (!rateLimit(LIMITE_DE_CODIGO, auth.user.id).allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde um minuto." },
      { status: 429 }
    );
  }

  try {
    const { id } = await params;
    const { codigo } = await request.json().catch(() => ({ codigo: undefined }));
    if (typeof codigo !== "string" || !codigo.trim()) {
      return NextResponse.json(
        { error: "Informe o codigo do aplicativo para remover a passkey." },
        { status: 400 }
      );
    }

    const prova = await provarFatorAtual(auth.user.id, codigo);
    if (!prova) {
      return NextResponse.json({ error: "Codigo invalido." }, { status: 400 });
    }

    try {
      await db.transaction(async (tx) => {
        await registrarAuditoriaObrigatoria(
          {
            action: "PASSKEY_REMOVED",
            entityType: "User",
            entityId: auth.user.id,
            userId: auth.user.id,
            details: { passkeyId: id, provaApresentada: prova },
            request,
          },
          tx
        );
        // Nada removido desfaz a trilha junto. Do contrario ficaria registrada
        // a remocao de uma credencial que nunca existiu nesta conta.
        if (!(await remover(auth.user.id, id, tx))) throw new NaoEncontrada();
      });
    } catch (erro) {
      if (erro instanceof NaoEncontrada) {
        return NextResponse.json({ error: "Passkey nao encontrada." }, { status: 404 });
      }
      throw erro;
    }

    return NextResponse.json({ ok: true });
  } catch (erro) {
    console.error("[Me/passkey] remover:", erro);
    return NextResponse.json({ error: "Erro ao remover a passkey" }, { status: 500 });
  }
}
