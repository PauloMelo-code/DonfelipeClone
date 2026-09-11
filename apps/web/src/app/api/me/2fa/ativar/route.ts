import { NextRequest, NextResponse } from "next/server";
import { requireSessaoParaCadastrarFator } from "@/lib/auth";
import { concluirCadastro } from "@/lib/segundo-fator";
import { registrarAuditoria } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Liga o segundo fator, provando que o autenticador funciona.
//
// Exigir o codigo aqui evita a conta trancada por um QR que a pessoa achou que
// tinha escaneado. E, ao ligar, a sessao atual morre: quem cadastrou entra de
// novo apresentando o codigo, e so entao o ciclo inteiro esta provado.
//
// A resposta traz os codigos de resgate EM CLARO -- a unica vez em que eles
// existem fora do hash. Nenhuma leitura posterior os devolve.
// ---------------------------------------------------------------------------

/** Teto proprio: o de sessao (60/min) e largo demais para conferir codigo. */
const LIMITE_DE_CODIGO = { name: "2fa-codigo", maxRequests: 10, windowSeconds: 60 };

export async function POST(request: NextRequest) {
  const auth = await requireSessaoParaCadastrarFator();
  if (!auth.success) return auth.response;

  if (!rateLimit(LIMITE_DE_CODIGO, auth.user.id).allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde um minuto." },
      { status: 429 }
    );
  }

  try {
    const { codigo } = await request.json();
    if (typeof codigo !== "string") {
      return NextResponse.json({ error: "Informe o codigo do aplicativo." }, { status: 400 });
    }

    const concluido = await concluirCadastro(auth.user.id, codigo);
    if (!concluido) {
      return NextResponse.json(
        { error: "Codigo invalido. Confira o relogio do celular e tente o proximo." },
        { status: 400 }
      );
    }

    // Fail-open: o fator ja esta ligado e nao seria desfeito por causa da
    // trilha. A semente e os codigos nunca entram aqui.
    await registrarAuditoria({
      action: "TOTP_ENABLED",
      entityType: "User",
      entityId: auth.user.id,
      userId: auth.user.id,
      details: { meio: "totp" },
      request,
    });

    return NextResponse.json({
      ok: true,
      codigos: concluido.codigos,
      // As sessoes foram encerradas: o cookie que a tela tem na mao morreu.
      sessaoEncerrada: true,
    });
  } catch (erro) {
    console.error("[Me/2fa] ativar:", erro);
    return NextResponse.json({ error: "Erro ao ativar o segundo fator" }, { status: 500 });
  }
}
