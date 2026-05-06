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
    const { data } = await this.client.get("/group/list", {
      params: { force: force ?? false, noparticipants: true },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = Array.isArray(data) ? data : data?.groups ?? [];
    return raw.map((g) => ({
      id: g.JID || g.id || "",
      subject: g.Name || g.subject || "",
      size: g.Size || g.size || 0,
      creation: g.Creation || g.creation || 0,
      owner: g.OwnerJID || g.owner || "",
      profilePictureUrl: g.profilePictureUrl || g.ProfilePictureUrl || undefined,
    }));
  }

  async sendText(payload: SendTextPayload): Promise<SendResult> {
    try {
      const { data } = await this.client.post<SendResult>("/send/text", payload);
      return data;
    } catch (err) {
      throw this.normalizeError(err, "sendText");
    }
  }

  async sendMedia(payload: SendMediaPayload): Promise<SendResult> {
    try {
      // Media payloads can be 5-10MB base64 — give them up to 3min.
      const { data } = await this.client.post<SendResult>("/send/media", payload, {
        timeout: 180_000,
      });
      return data;
    } catch (err) {
      throw this.normalizeError(err, "sendMedia");
    }
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
