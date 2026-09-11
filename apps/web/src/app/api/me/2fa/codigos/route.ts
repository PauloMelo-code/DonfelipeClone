import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, usuarios, vivosE } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { conferirSegundoFator } from "@/lib/segundo-fator";
import { quantosRestam, substituirCodigos } from "@/lib/codigos-de-resgate";
import { registrarAuditoriaObrigatoria } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Codigos de resgate: quantos restam (GET) e um conjunto novo (POST).
//
// O GET devolve so a CONTAGEM. A regua e explicita: a tela de seguranca nao
// mostra codigos de resgate a cada carregamento -- eles aparecem uma vez,
// quando sao gerados, e o que sobra e a memoria de quem guardou o papel.
//
// Gerar de novo invalida os anteriores por delete logico. A linha gasta e a
// prova de que aquele codigo foi usado; apagar destroi a prova.
// ---------------------------------------------------------------------------

const LIMITE_DE_CODIGO = { name: "2fa-codigo", maxRequests: 10, windowSeconds: 60 };

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;
  return NextResponse.json({ restantes: await quantosRestam(auth.user.id) });
}

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
        { error: "Informe o codigo do aplicativo." },
        { status: 400 }
      );
    }

    const [conta] = await db
      .select({
        id: usuarios.id,
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

    const codigos = await db.transaction(async (tx) => {
      // ANTES do efeito: o conjunto anterior sai de circulacao aqui.
      await registrarAuditoriaObrigatoria(
        {
          action: "RECOVERY_CODES_REGENERATED",
          entityType: "User",
          entityId: conta.id,
          userId: conta.id,
          details: { provaApresentada: prova.meio },
          request,
        },
        tx
      );
      return substituirCodigos(conta.id, tx);
    });

    return NextResponse.json({ ok: true, codigos });
  } catch (erro) {
    console.error("[Me/2fa] codigos:", erro);
    return NextResponse.json({ error: "Erro ao gerar codigos de resgate" }, { status: 500 });
  }
}
