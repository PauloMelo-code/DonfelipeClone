import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { concluirCadastro, listar } from "@/lib/passkey";
import { registrarAuditoria } from "@/lib/audit";

// ---------------------------------------------------------------------------
// As passkeys da SESSAO CORRENTE: listar e cadastrar.
//
// A listagem devolve apelido e datas, nunca a credencial em si. Nao ha segredo
// a proteger aqui -- a chave guardada e a publica -- mas o id da credencial
// nao serve a tela e nao precisa circular.
//
// Quem autoriza o cadastro e o desafio, obtido em `/api/me/passkey/desafio`
// mediante o codigo do fator atual. Esta rota so completa o que aquela ja
// autorizou: o desafio e de uso unico e amarrado a conta.
// ---------------------------------------------------------------------------

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;
  return NextResponse.json({ passkeys: await listar(auth.user.id) });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { resposta, apelido } = await request.json();
    if (!resposta || typeof resposta !== "object") {
      return NextResponse.json({ error: "Resposta do autenticador ausente." }, { status: 400 });
    }

    const cadastrada = await concluirCadastro(
      auth.user.id,
      resposta,
      typeof apelido === "string" ? apelido : "Passkey"
    );
    if (!cadastrada) {
      // Sem detalhar o motivo: desafio vencido, origem errada ou falta de
      // verificacao do dono nao ajudam quem esta do lado certo.
      return NextResponse.json(
        { error: "Nao foi possivel cadastrar esta passkey. Comece de novo." },
        { status: 400 }
      );
    }

    await registrarAuditoria({
      action: "PASSKEY_ADDED",
      entityType: "User",
      entityId: auth.user.id,
      userId: auth.user.id,
      details: { passkeyId: cadastrada.id, apelido: cadastrada.apelido },
      request,
    });

    return NextResponse.json({ ok: true, passkey: cadastrada });
  } catch (erro) {
    console.error("[Me/passkey] cadastrar:", erro);
    return NextResponse.json({ error: "Erro ao cadastrar a passkey" }, { status: 500 });
  }
}
