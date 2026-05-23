import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import axios from "axios";

/**
 * GET /api/admin/uazapi-debug?instance=capture|send&group_jid=...
 *
 * Endpoint de diagnostico: faz chamadas RAW na UAZAPI e retorna o JSON cru
 * pra inspecao. Util quando o sync nao traz nome dos grupos -- mostra
 * exatamente o que a UAZAPI esta devolvendo.
 *
 * Retorna primeiras 3 amostras de cada lista + total.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  const { searchParams } = new URL(request.url);
  const instance = searchParams.get("instance") ?? "capture";
  const groupJid = searchParams.get("group_jid");

  const baseURL =
    instance === "send"
      ? process.env.UAZAPI_SEND_BASE_URL ?? process.env.UAZAPI_BASE_URL
      : process.env.UAZAPI_BASE_URL;
  const token =
    instance === "send"
      ? process.env.UAZAPI_SEND_TOKEN ?? process.env.UAZAPI_TOKEN
      : process.env.UAZAPI_TOKEN;

  if (!baseURL || !token) {
    return NextResponse.json(
      { error: `Instancia ${instance} nao configurada (UAZAPI_${instance === "send" ? "SEND_" : ""}BASE_URL / TOKEN)` },
      { status: 400 }
    );
  }

  const client = axios.create({
    baseURL,
    timeout: 30_000,
    headers: { "Content-Type": "application/json", token, Accept: "application/json" },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeCall = async (label: string, fn: () => Promise<any>) => {
    try {
      const data = await fn();
      const arr = Array.isArray(data)
        ? data
        : data?.groups ?? data?.newsletters ?? data?.channels ?? data?.chats ?? data?.results ?? data?.items ?? [];
      const total = Array.isArray(arr) ? arr.length : 0;
      const sample = Array.isArray(arr) ? arr.slice(0, 3) : null;
      const keysOfFirst = sample && sample[0] ? Object.keys(sample[0]) : [];
      const responseShape = !Array.isArray(data) ? Object.keys(data || {}) : "array";
      return { ok: true as const, label, total, responseShape, keysOfFirst, sample };
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e: any = err;
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      const body = axios.isAxiosError(err) ? err.response?.data : undefined;
      return { ok: false as const, label, error: e.message, status, body };
    }
  };

  const results: Record<string, unknown> = {};

  // /group/list com noparticipants=true (o sync agora usa essa chamada)
  results.group_list = await safeCall("GET /group/list?force=true&noparticipants=true", async () => {
    const { data } = await client.get("/group/list", {
      params: { force: true, noparticipants: true },
    });
    return data;
  });

  // ── Newsletters (varios shapes) ─────────────────────────────────────
  results.newsletter_list = await safeCall("GET /newsletter/list", async () => {
    const { data } = await client.get("/newsletter/list");
    return data;
  });
  results.newsletter_find = await safeCall("POST /newsletter/find {}", async () => {
    const { data } = await client.post("/newsletter/find", {});
    return data;
  });
  results.newsletter_subscribed = await safeCall("GET /newsletter/subscribed", async () => {
    const { data } = await client.get("/newsletter/subscribed");
    return data;
  });
  results.newsletter_list_subscribed = await safeCall("GET /newsletter/list?subscribed=true", async () => {
    const { data } = await client.get("/newsletter/list", { params: { subscribed: true } });
    return data;
  });

  // ── Chats: contagem por tipo + amostra de broadcast/newsletter ─────
  results.chat_find_post = await safeCall("POST /chat/find {}", async () => {
    const { data } = await client.post("/chat/find", {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chats: any[] = Array.isArray(data?.chats) ? data.chats : [];
    const byType = { broadcast: 0, group: 0, newsletter: 0, user: 0, other: 0 };
    const samples = { broadcast: [] as unknown[], newsletter: [] as unknown[] };
    for (const c of chats) {
      const id: string = c.wa_chatid || "";
      if (id.endsWith("@broadcast")) {
        byType.broadcast++;
        if (samples.broadcast.length < 3) samples.broadcast.push(c);
      } else if (id.endsWith("@newsletter")) {
        byType.newsletter++;
        if (samples.newsletter.length < 3) samples.newsletter.push(c);
      } else if (id.endsWith("@g.us") || c.wa_isGroup) {
        byType.group++;
      } else if (id.endsWith("@s.whatsapp.net")) {
        byType.user++;
      } else {
        byType.other++;
      }
    }
    return { total: chats.length, byType, samples };
  });

  // ── Tentar endpoints alternativos pra LISTAS DE TRANSMISSAO ────────
  results.broadcast_list = await safeCall("GET /broadcast/list", async () => {
    const { data } = await client.get("/broadcast/list");
    return data;
  });
  results.chat_find_broadcasts = await safeCall("POST /chat/find { wa_isBroadcast:true }", async () => {
    const { data } = await client.post("/chat/find", { wa_isBroadcast: true });
    return data;
  });

  // Info de 1 grupo especifico (se passado via query)
  if (groupJid) {
    results.group_info = await safeCall(`POST /group/info { jid: "${groupJid}" }`, async () => {
      const { data } = await client.post("/group/info", { jid: groupJid });
      return data;
    });
    results.group_info_groupjid = await safeCall(`POST /group/info { groupjid }`, async () => {
      const { data } = await client.post("/group/info", { groupjid: groupJid });
      return data;
    });
  }

  return NextResponse.json({
    instance,
    baseURL,
    tokenPrefix: token.slice(0, 8) + "...",
    results,
  });
}
