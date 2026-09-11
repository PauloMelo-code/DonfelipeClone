import { NextRequest, NextResponse } from "next/server";
import { db, configuracoes, carimboDeEdicao, vivos } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";
import { validateBody } from "@/lib/validate";
import { updateSettingsSchema } from "@/lib/validations";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const settings = await db
      .select({ key: configuracoes.key, value: configuracoes.value })
      .from(configuracoes)
      .where(vivos(configuracoes));

    const settingsMap: Record<string, string> = {};
    for (const setting of settings) {
      settingsMap[setting.key] = setting.value;
    }

    return NextResponse.json(settingsMap);
  } catch (error) {
    console.error("[Settings] Error fetching settings:", error);
    return NextResponse.json(
      { error: "Erro ao buscar configuracoes" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const body = await request.json();
    const validation = validateBody(updateSettingsSchema, body);
    if (!validation.success) return validation.response;

    const entries = Object.entries(validation.data) as [string, string][];
    const results: Record<string, string> = {};

    for (const [key, value] of entries) {
      const stringValue = String(value);

      await db
        .insert(configuracoes)
        .values({ key, value: stringValue, modifiedBy: auth.user.id })
        .onConflictDoUpdate({
          target: configuracoes.key,
          set: {
            value: stringValue,
            // Reativa a chave se ela tiver sido excluida logicamente.
            isDeleted: false,
            deletedAt: null,
            ...carimboDeEdicao(auth.user.id),
          },
        });

      results[key] = stringValue;
    }

    await registrarAuditoria({
      action: "SETTINGS_UPDATED",
      entityType: "Setting",
      userId: auth.user.id,
      details: { keys: Object.keys(results), values: results },
      request,
    });

    return NextResponse.json({
      message: "Configuracoes atualizadas com sucesso",
      updated: results,
    });
  } catch (error) {
    console.error("[Settings] Error updating settings:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar configuracoes" },
      { status: 500 }
    );
  }
}
