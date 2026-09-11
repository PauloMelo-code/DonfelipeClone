import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, usuarios, carimboDeEdicao, vivosE } from "@/lib/db";
import { requireSessaoParaTrocarSenha } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";
import { revogarTodasDe } from "@/lib/sessoes";
import { validarSenha, TAMANHO_MAXIMO_BRUTO } from "@/lib/validators/password";

// ---------------------------------------------------------------------------
// Troca da PROPRIA senha.
//
// Fecha o REQ-G3 da auditoria: nao havia caminho nenhum para alguem trocar a
// propria senha, e quem suspeitasse de vazamento dependia de um administrador
// -- que, por sua vez, escolhia a senha nova por ele.
//
// O alvo e sempre a sessao corrente. Esta rota NAO aceita `userId`: fosse
// assim, seria a rota de administrador de novo, com outro nome.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const auth = await requireSessaoParaTrocarSenha();
  if (!auth.success) return auth.response;

  try {
    const { senhaAtual, senhaNova } = await request.json();

    if (typeof senhaAtual !== "string" || typeof senhaNova !== "string") {
      return NextResponse.json(
        { error: "Informe a senha atual e a nova senha." },
        { status: 400 }
      );
    }

    // Teto bruto ANTES do KDF, nos dois campos: sem ele um corpo de megabytes
    // vira trabalho de bcrypt.
    if (senhaAtual.length > TAMANHO_MAXIMO_BRUTO || senhaNova.length > TAMANHO_MAXIMO_BRUTO) {
      return NextResponse.json({ error: "Senha longa demais." }, { status: 400 });
    }

    const [usuario] = await db
      .select()
      .from(usuarios)
      .where(vivosE(usuarios, eq(usuarios.id, auth.user.id)))
      .limit(1);
    if (!usuario) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    // Trocar a senha exige provar que a atual e sua. Sem isto, um cookie
    // roubado troca a credencial e o dono perde a conta.
    const confere = await bcrypt.compare(senhaAtual, usuario.password);
    if (!confere) {
      return NextResponse.json({ error: "Senha atual incorreta." }, { status: 400 });
    }

    if (senhaNova === senhaAtual) {
      return NextResponse.json(
        { error: "A nova senha precisa ser diferente da atual." },
        { status: 400 }
      );
    }

    const politica = await validarSenha(senhaNova, {
      nome: usuario.name,
      email: usuario.email,
    });
    if (!politica.ok) {
      return NextResponse.json(
        { error: "Senha nao atende a politica", details: politica.erros },
        { status: 400 }
      );
    }

    await db
      .update(usuarios)
      .set({
        password: await bcrypt.hash(senhaNova, 10),
        // A senha passa a ser do dono: a marca de temporaria sai, e o prazo
        // dela junto -- senha propria nao vence por aqui.
        mustChangePassword: false,
        tempPasswordExpiresAt: null,
        ...carimboDeEdicao(auth.user.id),
      })
      .where(vivosE(usuarios, eq(usuarios.id, auth.user.id)));

    // As OUTRAS sessoes caem. Esta continua.
    //
    // Sem isto, quem troca a senha porque desconfia de vazamento nao expulsa
    // ninguem: a auditoria de 2026-09-10 mediu duas abas, trocou a senha numa
    // e a outra seguiu respondendo 200 -- pelas 24 h do teto absoluto. Quem
    // pediu a troca fica, porque derrubar a propria sessao no meio da acao
    // seria hostil e faria a pessoa achar que deu errado.
    const derrubadas = await revogarTodasDe(auth.user.id, "senha-trocada", {
      exceto: auth.sessaoId,
    });

    // Fail-open: a troca ja aconteceu e nao pode ser desfeita por causa da
    // trilha. O valor da senha nunca entra aqui.
    await registrarAuditoria({
      action: "PASSWORD_CHANGED_BY_OWNER",
      entityType: "User",
      entityId: auth.user.id,
      userId: auth.user.id,
      details: { eraTemporaria: usuario.mustChangePassword, sessoesEncerradas: derrubadas },
      request,
    });

    return NextResponse.json({ ok: true, sessoesEncerradas: derrubadas });
  } catch (error) {
    console.error("[Me] Erro ao trocar senha:", error);
    return NextResponse.json({ error: "Erro ao trocar a senha" }, { status: 500 });
  }
}
