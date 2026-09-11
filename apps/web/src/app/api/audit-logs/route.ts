import { NextRequest, NextResponse } from "next/server";
import { and, or, eq, ilike, desc, count, type SQL } from "drizzle-orm";
import { db, trilhaAuditoria, usuarios, veiculos, vivos } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { comoTermoLike } from "@/lib/db/like";

export async function GET(request: NextRequest) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const action = searchParams.get("action") || "";
    const search = searchParams.get("search") || "";

    const condicoes: (SQL | undefined)[] = [vivos(trilhaAuditoria)];
    if (action) condicoes.push(eq(trilhaAuditoria.action, action));
    if (search) {
      const termo = comoTermoLike(search);
      condicoes.push(
        or(ilike(trilhaAuditoria.entityId, termo), ilike(trilhaAuditoria.details, termo))
      );
    }
    const filtro = and(...condicoes);

    const [linhas, [totalizador]] = await Promise.all([
      db
        .select({
          log: trilhaAuditoria,
          user: { id: usuarios.id, name: usuarios.name, email: usuarios.email },
          vehicle: { id: veiculos.id, model: veiculos.model, brand: veiculos.brand },
        })
        .from(trilhaAuditoria)
        .leftJoin(usuarios, eq(usuarios.id, trilhaAuditoria.userId))
        .leftJoin(veiculos, eq(veiculos.id, trilhaAuditoria.vehicleId))
        .where(filtro)
        .orderBy(desc(trilhaAuditoria.createdAt))
        .offset((page - 1) * limit)
        .limit(limit),
      db.select({ n: count() }).from(trilhaAuditoria).where(filtro),
    ]);

    // Mesma forma que a tela ja consome: user e vehicle aninhados no log.
    const logs = linhas.map((l) => ({
      ...l.log,
      user: l.user?.id ? l.user : null,
      vehicle: l.vehicle?.id ? l.vehicle : null,
    }));
    const total = totalizador?.n ?? 0;

    return NextResponse.json({
      logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[AuditLogs] Error:", error);
    return NextResponse.json(
      { error: "Erro ao carregar logs de auditoria" },
      { status: 500 }
    );
  }
}
