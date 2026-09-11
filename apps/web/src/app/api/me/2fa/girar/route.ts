import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, usuarios, vivosE } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { conferirSegundoFator, girar } from "@/lib/segundo-fator";
import { registrarAuditoriaObrigatoria } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Troca o autenticador: semente nova, codigos de resgate novos.
//
// E o que a regua chama de "remover autenticador ROTACIONA, mantem o piso".
// Nao existe rota de desligar: a conta sai daqui com um fator novo, nunca sem
// fator. Celular novo passa por aqui; celular perdido, tambem -- um codigo de
// resgate serve de prova no lugar do aplicativo.
//
// Exigir o fator atual e o que separa isto de um sequestro de conta: sem essa
// prova, um cookie roubado bastaria para trocar o autenticador do dono e
// tranca-lo para fora da propria conta.
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
    const { codigo } = await request.json();
    if (typeof codigo !== "string" || !codigo.trim()) {
      return NextResponse.json(
        { error: "Informe o codigo atual do aplicativo ou um codigo de resgate." },
        { status: 400 }
      );
    }

    const [conta] = await db
      .select({
        id: usuarios.id,
        email: usuarios.email,
        totpSecret: usuarios.totpSecret,
        totpEnabledAt: usuarios.totpEnabledAt,
        totpLastStep: usuarios.totpLastStep,
      })
      .from(usuarios)
      .where(vivosE(usuarios, eq(usuarios.id, auth.user.id)))
      .limit(1);
    if (!conta) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

    const prova = await conferirSegundoFator(conta, codigo.trim());
    if (!prova.ok) {
      return NextResponse.json({ error: "Codigo invalido." }, { status: 400 });
    }

    const novo = await db.transaction(async (tx) => {
      // ANTES do efeito e FAIL-CLOSED: girar apaga a semente anterior, e
      // ninguem conseguiria provar depois qual autenticador havia. Trilha que
      // nao grava desfaz a troca junto.
      await registrarAuditoriaObrigatoria(
        {
          action: "TOTP_ROTATED",
          entityType: "User",
          entityId: conta.id,
          userId: conta.id,
          details: { provaApresentada: prova.meio },
          request,
        },
        tx
      );
      return girar(conta.id, conta.email, tx);
    });

    return NextResponse.json({ ...novo, sessaoEncerrada: true });
  } catch (erro) {
    console.error("[Me/2fa] girar:", erro);
    return NextResponse.json({ error: "Erro ao trocar o autenticador" }, { status: 500 });
  }
}
