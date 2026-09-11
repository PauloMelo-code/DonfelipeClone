import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, usuarios, vivosE } from "@/lib/db";
import { requireSessaoParaCadastrarFator } from "@/lib/auth";
import { quantosRestam } from "@/lib/codigos-de-resgate";

// ---------------------------------------------------------------------------
// Estado do segundo fator da SESSAO CORRENTE.
//
// Alcancavel por conta com cadastro pendente -- e a leitura que a tela de
// cadastro faz para saber se ja terminou. Nao devolve semente, nem codigo de
// resgate, nem hash: so o que a tela precisa desenhar.
// ---------------------------------------------------------------------------

export async function GET() {
  const auth = await requireSessaoParaCadastrarFator();
  if (!auth.success) return auth.response;

  const [conta] = await db
    .select({ totpEnabledAt: usuarios.totpEnabledAt })
    .from(usuarios)
    .where(vivosE(usuarios, eq(usuarios.id, auth.user.id)))
    .limit(1);
  if (!conta) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const ativo = conta.totpEnabledAt !== null;
  return NextResponse.json({
    ativo,
    desde: conta.totpEnabledAt,
    codigosRestantes: ativo ? await quantosRestam(auth.user.id) : 0,
  });
}
