import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { uazapi, uazapiSend } from "@/lib/uazapi";
import { invalidateGroupsCache } from "../route";

/**
 * POST /api/groups/resolve-names
 *
 * Tenta resolver nomes de grupos/contatos que ainda estao com placeholder
 * (so o numero, JID puro, ou "Contato: +5511...").
 *
 * Estrategia:
 *  1. listChats() de ambas instancias UAZAPI -> mapa de JID -> nome
 *  2. Pra cada grupo com nome ruim, busca um nome melhor no mapa
 *  3. Update no DB respeitando nameLocked
 */
function isPlaceholderName(name: string, groupId: string): boolean {
  if (!name) return true;
  if (name === groupId) return true;
  const n = name.trim();
  // "Contato: +5511..." ou "+5511..." ou so digitos
  if (/^Contato:?\s*\+?\d{8,}$/.test(n)) return true;
  if (/^\+?\d{8,}$/.test(n)) return true;
  // Comecando com prefixo (Canal:, Lista:, etc) seguido de numero
  if (/^(Canal|Lista|Contato|Comunidade):?\s*\+?\d{8,}$/.test(n)) return true;
  return false;
}

export async function POST() {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    // Coleta nomes de ambas instancias
    const nameMap = new Map<string, string>();
    const addChats = async (label: string, fn: () => Promise<Array<{ id: string; name: string }>>) => {
      try {
        const chats = await fn();
        for (const c of chats) {
          if (c.id && c.name && c.name.length >= 2) {
            // Mantem o nome mais "rico" (mais longo)
            const existing = nameMap.get(c.id);
            if (!existing || c.name.length > existing.length) {
              nameMap.set(c.id, c.name);
            }
          }
        }
      } catch (e) {
        console.error(`[ResolveNames] ${label} failed:`, e);
      }
    };

    await addChats("capture/listChats", () => uazapi.listChats());
    if (uazapiSend.isConfigured) {
      await addChats("send/listChats", () => uazapiSend.listChats());
    }

    // Busca grupos com nome placeholder (respeita nameLocked)
    const candidates = await prisma.whatsAppGroup.findMany({
      where: { nameLocked: false },
      select: { id: true, groupId: true, name: true, isContact: true },
    });

    let updated = 0;
    let skipped = 0;
    const samples: Array<{ jid: string; from: string; to: string }> = [];

    for (const g of candidates) {
      if (!isPlaceholderName(g.name, g.groupId)) {
        skipped++;
        continue;
      }
      const resolved = nameMap.get(g.groupId);
      if (!resolved) {
        skipped++;
        continue;
      }
      const finalName = g.isContact ? `Contato: ${resolved}` : resolved;
      if (finalName === g.name) {
        skipped++;
        continue;
      }
      await prisma.whatsAppGroup.update({
        where: { id: g.id },
        data: { name: finalName },
      });
      updated++;
      if (samples.length < 10) {
        samples.push({ jid: g.groupId, from: g.name, to: finalName });
      }
    }

    if (updated > 0) invalidateGroupsCache();

    return NextResponse.json({
      message: `${updated} nomes resolvidos · ${skipped} ja estavam ok ou sem fonte`,
      updated,
      skipped,
      totalChats: nameMap.size,
      samples,
    });
  } catch (error) {
    console.error("[ResolveNames] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado" },
      { status: 500 }
    );
  }
}
