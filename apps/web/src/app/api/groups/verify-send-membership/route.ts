import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { uazapi, uazapiSend, getSendClient } from "@/lib/uazapi";

/**
 * GET /api/groups/verify-send-membership
 *
 * Lists target groups in the database and cross-checks against the SEND
 * instance's group list (the WhatsApp number that publishes). Any TARGET
 * group whose JID is not in the send instance's groups is flagged —
 * the send number was never added there, which is why publishing fails
 * with "Not a participant".
 *
 * If only one UAZAPI instance is configured (send falls back to capture),
 * the response notes that and skips the check.
 */
export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const sendClient = getSendClient();
    const usingSeparateInstance = uazapiSend.isConfigured;

    // List groups visible to each instance
    const [sendGroups, captureGroups, targetDbGroups] = await Promise.all([
      sendClient.listGroups().catch((err) => {
        throw new Error(`Falha ao listar grupos da instancia de envio: ${err instanceof Error ? err.message : String(err)}`);
      }),
      uazapi.isConfigured
        ? uazapi.listGroups().catch(() => [])
        : Promise.resolve([]),
      prisma.whatsAppGroup.findMany({
        where: { role: "TARGET", active: true },
        select: { id: true, groupId: true, name: true, region: true },
      }),
    ]);

    const sendGroupSet = new Set(sendGroups.map((g) => g.id));
    const captureGroupSet = new Set(captureGroups.map((g) => g.id));

    const verified = targetDbGroups.map((g) => {
      const inSend = sendGroupSet.has(g.groupId);
      const inCapture = captureGroupSet.has(g.groupId);
      const isDM = g.groupId.endsWith("@s.whatsapp.net");
      return {
        ...g,
        inSendInstance: inSend,
        inCaptureInstance: inCapture,
        isDM,
        // DM doesn't require membership; only group/community/broadcast does
        problem: !isDM && !inSend
          ? inCapture
            ? "Numero de envio nao e membro deste grupo (mas captura sim)"
            : "Grupo nao encontrado em nenhuma instancia"
          : null,
      };
    });

    const problemCount = verified.filter((g) => g.problem).length;

    return NextResponse.json({
      usingSeparateInstance,
      sendInstanceLabel: sendClient.label,
      sendInstanceTotalGroups: sendGroups.length,
      captureInstanceTotalGroups: captureGroups.length,
      totalTargetGroups: targetDbGroups.length,
      problemCount,
      groups: verified,
    });
  } catch (error) {
    console.error("[VerifyMembership] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}
