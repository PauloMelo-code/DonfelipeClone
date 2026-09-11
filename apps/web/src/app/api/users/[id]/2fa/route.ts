import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, usuarios, vivosE } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { zerarFator } from "@/lib/segundo-fator";
import { registrarAuditoriaObrigatoria } from "@/lib/audit";
import { MOTIVO_MINIMO, motivoValido, motivoParaTrilha } from "@/lib/guardas/usuarios";

// ---------------------------------------------------------------------------
// Administrador zera o segundo fator de OUTRA conta.
//
// Existe para o celular perdido com os codigos de resgate ja gastos. Sem esta
// porta, um fator obrigatorio transforma cada aparelho perdido num chamado sem
// solucao -- e e assim que aparece o botao de desligar o segundo fator, que a
// regua proibe.
//
// O que esta rota NAO faz: devolver a conta ao regime de senha unica. Ela
// volta ao estado de CADASTRO PENDENTE, que continua barrando tudo menos a
// propria tela de cadastro.
//
// Tres guardas, as mesmas da rota de alteracao de conta:
//   1. Sem AUTO-ALVO. Zerar o proprio fator seria persistencia de graca para
//      quem roubou um cookie de administrador: bastaria zerar e cadastrar o
//      proprio aplicativo.
//   2. MOTIVO obrigatorio, porque a acao e sobre a conta de outra pessoa.
//   3. Trilha ANTES do efeito e fail-closed: o efeito apaga a semente
//      anterior, e depois ninguem prova qual autenticador havia ali.
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;
    const { motivo } = await request.json().catch(() => ({ motivo: undefined }));

    if (id === auth.user.id) {
      return NextResponse.json(
        {
          error:
            "Voce nao pode zerar o proprio segundo fator. Use um codigo de resgate, ou peca a outro administrador.",
        },
        { status: 403 }
      );
    }

    if (!motivoValido(motivo)) {
      return NextResponse.json(
        { error: `Informe o motivo (minimo ${MOTIVO_MINIMO} caracteres).` },
        { status: 400 }
      );
    }

    const [alvo] = await db
      .select({
        id: usuarios.id,
        email: usuarios.email,
        totpEnabledAt: usuarios.totpEnabledAt,
      })
      .from(usuarios)
      .where(vivosE(usuarios, eq(usuarios.id, id)))
      .limit(1);
    if (!alvo) {
      return NextResponse.json({ error: "Usuario nao encontrado" }, { status: 404 });
    }

    await db.transaction(async (tx) => {
      await registrarAuditoriaObrigatoria(
        {
          action: "TOTP_RESET_BY_ADMIN",
          entityType: "User",
          entityId: alvo.id,
          userId: auth.user.id,
          details: {
            alvo: { id: alvo.id, email: alvo.email },
            antes: { fatorAtivo: alvo.totpEnabledAt !== null },
            depois: { fatorAtivo: false, cadastroPendente: true },
            motivo: motivoParaTrilha(motivo),
          },
          request,
        },
        tx
      );
      await zerarFator(alvo.id, auth.user.id, tx);
    });

    return NextResponse.json({ ok: true, cadastroPendente: true });
  } catch (erro) {
    console.error("[Users/2fa] zerar:", erro);
    return NextResponse.json({ error: "Erro ao zerar o segundo fator" }, { status: 500 });
  }
}
