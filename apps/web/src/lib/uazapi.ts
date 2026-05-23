import axios, { AxiosInstance } from "axios";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GroupInfo {
  id: string;
  subject: string;
  size: number;
  creation: number;
  owner: string;
  desc?: string;
  profilePictureUrl?: string;
}

export interface SendResult {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message: Record<string, unknown>;
  messageTimestamp: number;
  status: string;
}

export interface SendTextPayload {
  number: string;
  text: string;
  delay?: number;
  linkPreview?: boolean;
}

export interface SendMediaPayload {
  number: string;
  type: "image" | "video" | "document";
  file: string;
  text?: string;
  delay?: number;
}

export interface SendPresencePayload {
  number: string;
  presence: "composing" | "recording" | "paused";
  delay?: number;
}


// ---------------------------------------------------------------------------
// Client — supports multiple UAZAPI instances
// ---------------------------------------------------------------------------

class UazapiClient {
  private _client: AxiosInstance | null = null;
  private baseURLEnv: string;
  private tokenEnv: string;
  public label: string;

  constructor(baseURLEnv: string, tokenEnv: string, label: string) {
    this.baseURLEnv = baseURLEnv;
    this.tokenEnv = tokenEnv;
    this.label = label;
  }

  /** Check if this instance is configured (env vars set) */
  get isConfigured(): boolean {
    return !!(process.env[this.baseURLEnv] && process.env[this.tokenEnv]);
  }

  private get client(): AxiosInstance {
    if (!this._client) {
      const baseURL = process.env[this.baseURLEnv];
      const token = process.env[this.tokenEnv];

      if (!baseURL) {
        throw new Error(`${this.baseURLEnv} environment variable is not set`);
      }
      if (!token) {
        throw new Error(`${this.tokenEnv} environment variable is not set`);
      }

      this._client = axios.create({
        baseURL,
        // Default 90s — media uploads with base64 photos can take 30-60s
        // depending on UAZAPI processing. Was 30s, often hit timeout.
        timeout: 90_000,
        // Allow large base64 payloads (~10MB worst-case for HD photos).
        maxBodyLength: 20 * 1024 * 1024,
        maxContentLength: 20 * 1024 * 1024,
        headers: {
          "Content-Type": "application/json",
          token,
        },
      });
    }
    return this._client;
  }

  async listGroups(force?: boolean): Promise<GroupInfo[]> {
    // Cliente confirmou via curl: a chamada correta eh com noparticipants=true.
    // Resposta vem mais leve E com os nomes (a UAZAPI dele retorna os nomes
    // mesmo sem participantes). Antes nao passavamos esse param e payload
    // ficava enorme em listas grandes.
    const { data } = await this.client.get("/group/list", {
      params: { force: force ?? false, noparticipants: true },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = Array.isArray(data) ? data : data?.groups ?? [];

    // Log shape of the first item once per process to help diagnose missing
    // fields when names come back empty
    if (raw.length > 0 && !UazapiClient.loggedShape.has(this.label)) {
      UazapiClient.loggedShape.add(this.label);
      const sample = raw[0];
      console.log(
        `[UAZAPI:${this.label}] /group/list sample fields:`,
        Object.keys(sample || {}).join(", ")
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pick = (g: any, ...keys: string[]) => {
      for (const k of keys) {
        const v = g?.[k];
        if (v != null && v !== "") return v;
      }
      return undefined;
    };

    return raw.map((g) => ({
      id: pick(g, "JID", "id", "jid", "Id", "groupId", "GroupJID") ?? "",
      subject:
        pick(
          g,
          "Name",
          "name",
          "subject",
          "Subject",
          "groupSubject",
          "GroupSubject",
          "groupName",
          "GroupName",
          "Title",
          "title"
        ) ?? "",
      size: pick(g, "Size", "size", "participantCount") ?? 0,
      creation: pick(g, "Creation", "creation", "createdAt") ?? 0,
      owner: pick(g, "OwnerJID", "owner", "Owner") ?? "",
      profilePictureUrl: pick(g, "profilePictureUrl", "ProfilePictureUrl", "PicUrl"),
    }));
  }

  /** Fetch full group metadata (incl. subject) for a single JID. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getGroupInfo(groupJid: string): Promise<{ subject?: string; profilePictureUrl?: string } | null> {
    // Helper: extract subject from any of the known field shapes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extractSubject = (d: any): string | undefined => {
      if (!d) return undefined;
      // Pode vir como array (alguns endpoints retornam {results: [...]} ou direto array)
      const obj = Array.isArray(d) ? d[0] : Array.isArray(d?.results) ? d.results[0] : Array.isArray(d?.groups) ? d.groups[0] : d;
      if (!obj) return undefined;
      // Tenta nivel principal
      const direct = obj.Name || obj.name || obj.subject || obj.Subject || obj.groupSubject
        || obj.GroupSubject || obj.groupName || obj.GroupName || obj.Title || obj.title
        || obj.pushname || obj.pushName || obj.displayName || obj.chatName;
      if (direct) return direct;
      // Tenta dentro de .group ou .info ou .data (alguns endpoints envelopam)
      const nested = obj.group?.subject || obj.group?.name || obj.group?.Subject
        || obj.info?.subject || obj.info?.name
        || obj.data?.subject || obj.data?.name
        || obj.chat?.name || obj.chat?.subject;
      return nested;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extractPic = (d: any): string | undefined => {
      if (!d) return undefined;
      const obj = Array.isArray(d) ? d[0] : Array.isArray(d?.results) ? d.results[0] : d;
      return obj?.profilePictureUrl || obj?.ProfilePictureUrl || obj?.PicUrl || obj?.imageUrl;
    };

    // Try many endpoint shapes UAZAPI builds use
    const candidates = [
      // Variants of /group/info
      { method: "post" as const, url: "/group/info", body: { groupjid: groupJid } },
      { method: "post" as const, url: "/group/info", body: { jid: groupJid } },
      { method: "post" as const, url: "/group/info", body: { id: groupJid } },
      { method: "post" as const, url: "/group/info", body: { number: groupJid } },
      { method: "get" as const, url: "/group/info", params: { groupjid: groupJid } },
      { method: "get" as const, url: "/group/info", params: { jid: groupJid } },
      // /chat/find or /chat/info (some builds)
      { method: "post" as const, url: "/chat/find", body: { jid: groupJid } },
      { method: "post" as const, url: "/chat/find", body: { number: groupJid } },
      { method: "get" as const, url: "/chat/find", params: { number: groupJid } },
      // /group/list with forceInfo or filter
      { method: "post" as const, url: "/group/metadata", body: { groupjid: groupJid } },
      { method: "post" as const, url: "/group/metadata", body: { jid: groupJid } },
      // RESTful path style
      { method: "get" as const, url: `/group/${encodeURIComponent(groupJid)}` },
      { method: "get" as const, url: `/groups/${encodeURIComponent(groupJid)}` },
      { method: "get" as const, url: `/chat/${encodeURIComponent(groupJid)}` },
    ];

    for (const c of candidates) {
      try {
        const res = c.method === "post"
          ? await this.client.post(c.url, c.body)
          : await this.client.get(c.url, { params: c.params });
        const subject = extractSubject(res.data);
        if (subject) {
          return { subject, profilePictureUrl: extractPic(res.data) };
        }
      } catch {
        // try next candidate
      }
    }
    return null;
  }

  /** Force resync from /group/list with force=true. Some UAZAPI builds cache
   * subject and only refresh on force. */
  async refreshGroupSubject(groupJid: string): Promise<string | null> {
    try {
      const groups = await this.listGroups(true);
      const found = groups.find((g) => g.id === groupJid);
      return found?.subject || null;
    } catch {
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Chats (inclui listas de transmissao @broadcast)
  // ──────────────────────────────────────────────────────────────────────────

  /** Lista TODOS os chats da instancia (grupos, listas, canais, contatos)
   * via `POST /chat/find`. Endpoint que retorna o conjunto mais amplo --
   * usado pra descobrir broadcasts/listas que /group/list nao traz, e pra
   * detectar comunidades (wa_isGroup_community). */
  async listChats(): Promise<{
    id: string;
    name: string;
    kind: "broadcast" | "group" | "user" | "newsletter" | "unknown";
    isCommunity: boolean;
    isAnnounce: boolean;
  }[]> {
    try {
      const { data } = await this.client.post("/chat/find", {});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any[] = Array.isArray(data) ? data : data?.chats ?? [];
      return raw.map((c) => {
        const id: string = c.wa_chatid || c.wa_fastid || c.id || "";
        const name: string = c.wa_name || c.name || c.wa_contactName || "";
        const isGroup = !!c.wa_isGroup;
        const isCommunity = !!c.wa_isGroup_community;
        const isAnnounce = !!c.wa_isGroup_announce;
        let kind: "broadcast" | "group" | "user" | "newsletter" | "unknown" = "unknown";
        if (id.endsWith("@broadcast")) kind = "broadcast";
        else if (id.endsWith("@newsletter")) kind = "newsletter";
        else if (id.endsWith("@g.us") || isGroup) kind = "group";
        else if (id.endsWith("@s.whatsapp.net")) kind = "user";
        return { id, name, kind, isCommunity, isAnnounce };
      });
    } catch (err) {
      console.error(`[UAZAPI:${this.label}] listChats failed:`, err);
      return [];
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Newsletters / Canais
  // ──────────────────────────────────────────────────────────────────────────

  /** Lista canais (newsletters) que o numero acompanha.
   * `GET /newsletter/list` */
  async listNewsletters(): Promise<GroupInfo[]> {
    try {
      const { data } = await this.client.get("/newsletter/list");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any[] = Array.isArray(data) ? data : data?.newsletters ?? data?.channels ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pick = (g: any, ...keys: string[]) => {
        for (const k of keys) {
          const v = g?.[k];
          if (v != null && v !== "") return v;
        }
        return undefined;
      };
      return raw.map((g) => ({
        id: pick(g, "JID", "jid", "id", "Id") ?? "",
        subject:
          pick(g, "Name", "name", "subject", "Subject", "title", "Title", "newsletterName") ?? "",
        size: pick(g, "subscribers", "Size", "size") ?? 0,
        creation: pick(g, "Creation", "creation", "createdAt") ?? 0,
        owner: pick(g, "OwnerJID", "owner") ?? "",
        profilePictureUrl: pick(g, "profilePictureUrl", "ProfilePictureUrl", "PicUrl"),
      }));
    } catch (err) {
      console.error(`[UAZAPI:${this.label}] listNewsletters failed:`, err);
      return [];
    }
  }

  /** Info detalhada de um canal (puxa o nome quando o list nao traz).
   * `POST /newsletter/info {id, jid}` */
  async getNewsletterInfo(jid: string): Promise<{ subject?: string; profilePictureUrl?: string } | null> {
    try {
      // Normaliza id (parte numerica) e jid (com @newsletter)
      const id = jid.replace(/@newsletter$/i, "");
      const fullJid = jid.includes("@") ? jid : `${jid}@newsletter`;
      const { data } = await this.client.post("/newsletter/info", { id, jid: fullJid });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d: any = data;
      const subject = d?.Name || d?.name || d?.subject || d?.Subject || d?.title;
      if (!subject) return null;
      return { subject, profilePictureUrl: d?.profilePictureUrl };
    } catch {
      return null;
    }
  }

  // Track which instance has already logged its sample shape
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static loggedShape = new Set<string>();

  /**
   * Determina se o erro é transitório (vale a pena retry) ou permanente.
   * 502/503/504/429 = transitório (UAZAPI/WhatsApp temporariamente indisp).
   * 400/404/422 = permanente (payload errado, JID invalido, etc).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private isTransientError(err: any): boolean {
    if (!axios.isAxiosError(err)) return false;
    const status = err.response?.status;
    if (!status) {
      // Erros sem response (timeout, network) tambem sao transitorios
      return err.code === "ECONNABORTED" || err.code === "ECONNRESET" || err.code === "ETIMEDOUT";
    }
    return status === 502 || status === 503 || status === 504 || status === 429;
  }

  async sendText(payload: SendTextPayload): Promise<SendResult> {
    let lastErr: unknown;
    // 2 tentativas (1 inicial + 1 retry em caso de erro transitorio)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { data } = await this.client.post<SendResult>("/send/text", payload);
        return data;
      } catch (err) {
        lastErr = err;
        if (attempt === 0 && this.isTransientError(err)) {
          await new Promise((r) => setTimeout(r, 3000)); // 3s antes do retry
          console.log(`[UAZAPI:${this.label}] sendText transient error, retrying in 3s`);
          continue;
        }
        throw this.normalizeError(err, "sendText");
      }
    }
    throw this.normalizeError(lastErr, "sendText");
  }

  async sendMedia(payload: SendMediaPayload): Promise<SendResult> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // Media payloads can be 5-10MB base64 — give them up to 3min.
        const { data } = await this.client.post<SendResult>("/send/media", payload, {
          timeout: 180_000,
        });
        return data;
      } catch (err) {
        lastErr = err;
        if (attempt === 0 && this.isTransientError(err)) {
          await new Promise((r) => setTimeout(r, 5000)); // 5s antes (media e mais pesado)
          console.log(`[UAZAPI:${this.label}] sendMedia transient error, retrying in 5s`);
          continue;
        }
        throw this.normalizeError(err, "sendMedia");
      }
    }
    throw this.normalizeError(lastErr, "sendMedia");
  }

  /**
   * Convert axios errors into Error objects whose message includes the UAZAPI
   * response body. Without this, we just get "Request failed with status code"
   * with no clue what UAZAPI complained about.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private normalizeError(err: any, op: string): Error {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const body = err.response?.data;
      const apiMsg =
        (typeof body === "string" ? body : body?.error || body?.message || body?.detail) ?? null;
      const detail = apiMsg
        ? `${op} HTTP ${status ?? "?"}: ${typeof apiMsg === "string" ? apiMsg : JSON.stringify(apiMsg).slice(0, 300)}`
        : err.code === "ECONNABORTED"
          ? `${op} timeout (${err.config?.timeout ?? "?"}ms) — payload muito grande ou UAZAPI lenta`
          : `${op} ${err.message}`;
      console.error(`[UAZAPI:${this.label}] ${detail}`, {
        url: err.config?.url,
        status,
        bodyKeys: body && typeof body === "object" ? Object.keys(body) : undefined,
      });
      return new Error(detail);
    }
    return err instanceof Error ? err : new Error(String(err));
  }

  async sendPresence(payload: SendPresencePayload): Promise<void> {
    await this.client.post("/message/presence", payload);
  }

  async getStatus(): Promise<{ state: string; phone?: string }> {
    const { data } = await this.client.get("/instance/status");
    const instanceStatus = data?.instance?.status;
    const isConnected = data?.status?.connected || data?.status?.loggedIn;
    const state = isConnected ? "open" : instanceStatus === "connected" ? "open" : instanceStatus ?? data?.state ?? "unknown";
    const phone = data?.instance?.owner ?? data?.phone ?? data?.number ?? undefined;
    return { state, phone };
  }

  async getQR(): Promise<{ qrcode: string } | null> {
    // UAZAPI uses POST /instance/connect to generate QR code
    // Returns { instance: { qrcode: "data:image/png;base64,..." } }
    try {
      const { data } = await this.client.post("/instance/connect", {});
      const qr = data?.instance?.qrcode ?? data?.qrcode ?? data?.qr ?? null;
      return qr ? { qrcode: qr } : null;
    } catch {
      // Fallback: try GET /instance/qr
      try {
        const { data } = await this.client.get("/instance/qr");
        const qr = data?.qrcode ?? data?.qr ?? null;
        return qr ? { qrcode: qr } : null;
      } catch {
        return null;
      }
    }
  }

  async logout(): Promise<void> {
    await this.client.delete("/instance/logout");
  }

  async downloadMedia(messageId: string): Promise<{ base64Data: string; fileURL: string; mimetype: string } | null> {
    try {
      const { data } = await this.client.post("/message/download", {
        id: messageId,
        return_base64: true,
      });
      if (data?.base64Data || data?.fileURL) {
        return {
          base64Data: data.base64Data || "",
          fileURL: data.fileURL || "",
          mimetype: data.mimetype || "image/jpeg",
        };
      }
      return null;
    } catch (err) {
      console.error(`[UAZAPI:${this.label}] Failed to download media:`, err);
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------

/** Capture instance — receives messages from source groups (webhook) */
export const uazapi = new UazapiClient("UAZAPI_BASE_URL", "UAZAPI_TOKEN", "captura");

/** Send instance — publishes to target groups. Falls back to capture if not configured. */
export const uazapiSend = new UazapiClient("UAZAPI_SEND_BASE_URL", "UAZAPI_SEND_TOKEN", "envio");

/** Get the sending client — uses dedicated send instance if configured, otherwise falls back to capture */
export function getSendClient(): UazapiClient {
  return uazapiSend.isConfigured ? uazapiSend : uazapi;
}
