import { NextRequest, NextResponse } from "next/server";
import { and, count, eq, ne } from "drizzle-orm";
import { db, usuarios, carimboDeEdicao, travaDeColisao, vivos, vivosE } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { registrarAuditoriaObrigatoria } from "@/lib/audit";
import { revogarTodasDe } from "@/lib/sessoes";
import { validarSenha } from "@/lib/validators/password";
import {
  avaliarAlteracao,
  exigeMotivo,
  motivoParaTrilha,
  prazoDaTemporaria,
} from "@/lib/guardas/usuarios";
import type { Papel } from "@/lib/db/schema/users";
import bcrypt from "bcryptjs";

// ---------------------------------------------------------------------------
// Alteracao de uma conta por um administrador.
//
// Tres coisas aqui nasceram de defeitos reproduzidos na auditoria de
// 2026-09-10, e nenhuma e opcional:
//
//   1. A contagem de administradores e a gravacao acontecem na MESMA
//      transacao. Fora dela, duas requisicoes simultaneas leem "2 admins",
//      cada uma rebaixa um, e o sistema termina com zero.
//   2. A trilha e gravada ANTES do efeito e e fail-closed quando o efeito
//      destroi o estado anterior. Se a trilha nao grava, a promocao nao
//      acontece -- do contrario ficaria feita e invisivel.
//   3. Senha definida por administrador e TEMPORARIA. Quem redefiniu nao pode
//      sair conhecendo a credencial permanente do outro.
// ---------------------------------------------------------------------------

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, password, role, active, motivo } = body;

    if (role !== undefined && !["ADMIN", "OPERATOR"].includes(role)) {
      return NextResponse.json(
        { error: "Role invalido. Use ADMIN ou OPERATOR" },
        { status: 400 }
      );
    }

    // A senha e validada FORA da transacao: bcrypt e caro e a chamada a lista
    // de senhas vazadas vai a rede. Segurar a transacao aberta durante isso
    // prenderia a linha do usuario por centenas de milissegundos.
    let senhaNova: string | undefined;
    if (password !== undefined && password !== "") {
      const [alvo] = await db
        .select({ name: usuarios.name, email: usuarios.email })
        .from(usuarios)
        .where(vivosE(usuarios, eq(usuarios.id, id)))
        .limit(1);
      if (!alvo) {
        return NextResponse.json({ error: "Usuario nao encontrado" }, { status: 404 });
      }
      // A senha e verificada EXATAMENTE como recebida. O `.trim()` que estava
      // aqui alterava a senha antes do hash: quem escolhia senha com espaco na
      // ponta nao conseguia mais entrar por nenhum outro caminho.
      const politica = await validarSenha(password, { nome: alvo.name, email: alvo.email });
      if (!politica.ok) {
        return NextResponse.json(
          { error: "Senha nao atende a politica", details: politica.erros },
          { status: 400 }
        );
      }
      senhaNova = await bcrypt.hash(password, 10);
    }

    const resultado = await db.transaction(async (tx) => {
      const [alvo] = await tx
        .select()
        .from(usuarios)
        .where(vivosE(usuarios, eq(usuarios.id, id)))
        .limit(1);
      if (!alvo) return { erro: "Usuario nao encontrado", status: 404 as const };

      // Contagem lida DENTRO da transacao, junto com a decisao que depende
      // dela. E o que impede duas requisicoes paralelas de zerarem os admins.
      const [{ total }] = await tx
        .select({ total: count() })
        .from(usuarios)
        .where(vivosE(usuarios, eq(usuarios.role, "ADMIN"), eq(usuarios.active, true)));

      const operacao = {
        atorId: auth.user.id,
        alvoId: id,
        papelAtual: alvo.role as Papel,
        ativoAtual: alvo.active,
        papelNovo: role as Papel | undefined,
        ativoNovo: active as boolean | undefined,
        adminsAtivos: total,
        motivo,
      };

      const veredicto = avaliarAlteracao(operacao);
      if (!veredicto.ok) return { erro: veredicto.erro, status: veredicto.status };

      const campos: Record<string, unknown> = {};
      if (name !== undefined) campos.name = name;
      if (role !== undefined) campos.role = role;
      if (active !== undefined) campos.active = active;
      if (senhaNova !== undefined) {
        campos.password = senhaNova;
        // Temporaria, nunca definitiva: o dono troca no proximo acesso.
        campos.mustChangePassword = true;
        // E com prazo PROPRIO. A marca acima so age se o login acontecer;
        // sem prazo, a conta provisionada e nunca usada guardaria para sempre
        // uma senha que viajou por mensagem.
        campos.tempPasswordExpiresAt = prazoDaTemporaria();
      }

      if (Object.keys(campos).length === 0) {
        return { erro: "Nenhum campo para atualizar", status: 400 as const };
      }

      // ---- Trilha ANTES do efeito, fail-closed ----
      // Concessao ou revogacao de poder, desativacao e senha redefinida
      // destroem o estado anterior: se a trilha falhar, a transacao inteira
      // volta atras e a operacao nao acontece.
      const mudancaSensivel = exigeMotivo(operacao) || senhaNova !== undefined;
      if (mudancaSensivel) {
        await registrarAuditoriaObrigatoria(
          {
            action: acaoDaMudanca(operacao, senhaNova !== undefined),
            entityType: "User",
            entityId: id,
            userId: auth.user.id,
            details: {
              alvo: { id, email: alvo.email },
              antes: { role: alvo.role, active: alvo.active },
              depois: {
                role: role ?? alvo.role,
                active: active ?? alvo.active,
                senhaRedefinida: senhaNova !== undefined,
              },
              motivo: motivoParaTrilha(motivo),
            },
            request,
          },
          tx
        );
      }

      const [atualizado] = await tx
        .update(usuarios)
        .set({ ...campos, ...carimboDeEdicao(auth.user.id) })
        .where(travaDeColisao(usuarios, id, body?.updatedAt))
        .returning({
          id: usuarios.id,
          name: usuarios.name,
          email: usuarios.email,
          role: usuarios.role,
          active: usuarios.active,
          mustChangePassword: usuarios.mustChangePassword,
          createdAt: usuarios.createdAt,
          updatedAt: usuarios.updatedAt,
        });

      if (!atualizado) {
        return {
          erro: "Usuario alterado por outro administrador. Recarregue a tela.",
          status: 409 as const,
        };
      }

      // ---- As sessoes do ALVO caem ----
      //
      // Depois da trava de colisao e na MESMA transacao: se a gravacao voltar
      // atras, a revogacao volta junto.
      //
      // Desativar sem revogar era o pior dos casos que a auditoria de
      // 2026-09-10 mediu. A guarda recusava enquanto `active` fosse falso, mas
      // a LINHA continuava viva -- e reativar a conta meses depois ressuscitava
      // o cookie que ficou no navegador de quem saiu da empresa.
      //
      // Senha redefinida por administrador tambem derruba: o portao de senha
      // temporaria segura por enquanto, mas a sessao antiga voltaria a valer no
      // instante em que o dono escolhesse a senha dele.
      const desativou = active === false && alvo.active;
      if (desativou || senhaNova !== undefined) {
        await revogarTodasDe(id, desativou ? "conta-desativada" : "senha-trocada", {
          executor: tx,
        });
      }

      return { usuario: atualizado };
    });

    if ("erro" in resultado) {
      return NextResponse.json({ error: resultado.erro }, { status: resultado.status });
    }
    return NextResponse.json(resultado.usuario);
  } catch (error) {
    console.error("[Users] Error updating user:", error);
    return NextResponse.json({ error: "Erro ao atualizar usuario" }, { status: 500 });
  }
}

/** Nome do evento na trilha, especifico o bastante pra filtrar depois. */
function acaoDaMudanca(
  op: { papelAtual: Papel; papelNovo?: Papel; ativoAtual: boolean; ativoNovo?: boolean },
  senhaRedefinida: boolean
): string {
  if (op.papelNovo === "ADMIN" && op.papelAtual !== "ADMIN") return "USER_PROMOTED_ADMIN";
  if (op.papelAtual === "ADMIN" && op.papelNovo === "OPERATOR") return "USER_DEMOTED";
  if (op.ativoNovo === false && op.ativoAtual) return "USER_DEACTIVATED";
  if (op.ativoNovo === true && !op.ativoAtual) return "USER_REACTIVATED";
  if (senhaRedefinida) return "USER_PASSWORD_RESET_BY_ADMIN";
  return "USER_UPDATED";
}

/** Um administrador nunca some da lista sozinho; o proprio alvo tambem conta. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  const { id } = await params;
  const [usuario] = await db
    .select({
      id: usuarios.id,
      name: usuarios.name,
      email: usuarios.email,
      role: usuarios.role,
      active: usuarios.active,
      mustChangePassword: usuarios.mustChangePassword,
      createdAt: usuarios.createdAt,
    })
    .from(usuarios)
    .where(vivosE(usuarios, eq(usuarios.id, id)))
    .limit(1);

  if (!usuario) {
    return NextResponse.json({ error: "Usuario nao encontrado" }, { status: 404 });
  }

  // Quantos administradores ativos existem ALEM deste: a tela usa pra avisar
  // antes de o operador tentar rebaixar o ultimo.
  const [{ outros }] = await db
    .select({ outros: count() })
    .from(usuarios)
    .where(
      and(
        vivos(usuarios),
        eq(usuarios.role, "ADMIN"),
        eq(usuarios.active, true),
        ne(usuarios.id, id)
      )!
    );

  return NextResponse.json({ ...usuario, outrosAdminsAtivos: outros });
}
