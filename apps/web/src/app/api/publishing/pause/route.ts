import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, configuracoes, carimboDeEdicao, vivos } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";

const PAUSE_KEY = "publishing_paused";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const [setting] = await db
    .select({ value: configuracoes.value })
    .from(configuracoes)
    .where(and(eq(configuracoes.key, PAUSE_KEY), vivos(configuracoes)))
    .limit(1);

  return NextResponse.json({ paused: setting?.value === "true" });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  const body = await request.json().catch(() => ({}));
  const paused = body?.paused === true;
  const valor = paused ? "true" : "false";

  await db
    .insert(configuracoes)
    .values({ key: PAUSE_KEY, value: valor, modifiedBy: auth.user.id })
    .onConflictDoUpdate({
      target: configuracoes.key,
      set: { value: valor, isDeleted: false, deletedAt: null, ...carimboDeEdicao(auth.user.id) },
    });

  await registrarAuditoria({
    action: paused ? "PUBLISHING_PAUSED" : "PUBLISHING_RESUMED",
    entityType: "Setting",
    userId: auth.user.id,
    request,
  });

  return NextResponse.json({ paused });
}
