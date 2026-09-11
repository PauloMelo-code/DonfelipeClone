import { NextRequest, NextResponse } from "next/server";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db, usuarios, trilhaAuditoria, vivos } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { registrarAuditoria, registrarAuditoriaObrigatoria } from "@/lib/audit";
import { avaliarCriacao, motivoParaTrilha } from "@/lib/guardas/usuarios";
import { validarSenha } from "@/lib/validators/password";
import bcrypt from "bcryptjs";

export async function GET() {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const linhas = await db
      .select({
        id: usuarios.id,
        name: usuarios.name,
        email: usuarios.email,
        role: usuarios.role,
        active: usuarios.active,
        createdAt: usuarios.createdAt,
        totalTrilha: sql<number>`(
          select count(*)::int from ${trilhaAuditoria}
          where ${trilhaAuditoria.userId} = ${usuarios.id}
        )`,
      })
      .from(usuarios)
      .where(vivos(usuarios))
      // Ativos primeiro, depois por nome (ordem estavel).
      // Inativos descem pro final mas mantem ordenacao alfabetica entre si.
      .orderBy(desc(usuarios.active), asc(usuarios.name));

    // Mesma forma que a tela consome: _count.auditLogs
    const users = linhas.map(({ totalTrilha, ...u }) => ({
      ...u,
      _count: { auditLogs: totalTrilha },
    }));

    return NextResponse.json(users);
  } catch (error) {
    console.error("[Users] Error:", error);
    return NextResponse.json(
      { error: "Erro ao listar usuarios" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const body = await request.json();
    const { name, email, password, role, motivo } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Nome, email e senha sao obrigatorios" },
        { status: 400 }
      );
    }

    if (role && !["ADMIN", "OPERATOR"].includes(role)) {
      return NextResponse.json(
        { error: "Role deve ser ADMIN ou OPERATOR" },
        { status: 400 }
      );
    }

    // Criar uma conta ja como ADMIN e conceder o privilegio maximo, mesmo que
    // a conta seja nova. Cobra a mesma justificativa que promover alguem.
    const veredicto = avaliarCriacao(role || "OPERATOR", motivo);
    if (!veredicto.ok) {
      return NextResponse.json({ error: veredicto.erro }, { status: veredicto.status });
    }

    // Politica de senha: caminho de GRAVACAO, entao roda aqui.
    const politica = await validarSenha(password, { nome: name, email });
    if (!politica.ok) {
      return NextResponse.json(
        { error: "Senha nao atende a politica", details: politica.erros },
        { status: 400 }
      );
    }

    const [existing] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.email, email))
      .limit(1);
    if (existing) {
      return NextResponse.json(
        { error: "Email ja cadastrado" },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const papel = role || "OPERATOR";

    // Criar um ADMIN e concessao de poder: trilha ANTES do efeito e dentro da
    // mesma transacao, para que a falha de uma desfaca a outra.
    if (papel === "ADMIN") {
      const criado = await db.transaction(async (tx) => {
        await registrarAuditoriaObrigatoria(
          {
            action: "USER_CREATED_ADMIN",
            entityType: "User",
            userId: auth.user.id,
            details: { name, email, role: papel, motivo: motivoParaTrilha(motivo) },
            request,
          },
          tx
        );
        const [linha] = await tx
          .insert(usuarios)
          .values({ name, email, password: hashedPassword, role: papel, modifiedBy: auth.user.id })
          .returning({
            id: usuarios.id,
            name: usuarios.name,
            email: usuarios.email,
            role: usuarios.role,
            active: usuarios.active,
            createdAt: usuarios.createdAt,
          });
        return linha;
      });
      return NextResponse.json(criado, { status: 201 });
    }

    const [user] = await db
      .insert(usuarios)
      .values({
        name,
        email,
        password: hashedPassword,
        role: papel,
        modifiedBy: auth.user.id,
      })
      .returning({
        id: usuarios.id,
        name: usuarios.name,
        email: usuarios.email,
        role: usuarios.role,
        active: usuarios.active,
        createdAt: usuarios.createdAt,
      });

    await registrarAuditoria({
      action: "USER_CREATED",
      entityType: "User",
      entityId: user.id,
      userId: auth.user.id,
      details: { name, email, role: papel },
      request,
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error("[Users] Error creating user:", error);
    return NextResponse.json(
      { error: "Erro ao criar usuario" },
      { status: 500 }
    );
  }
}
