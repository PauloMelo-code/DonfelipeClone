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
        timeout: 30_000,
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
    const { data } = await this.client.post<SendResult>("/send/text", payload);
    return data;
  }

  async sendMedia(payload: SendMediaPayload): Promise<SendResult> {
    const { data } = await this.client.post<SendResult>("/send/media", payload);
    return data;
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
    const { data } = await this.client.get("/instance/qr");
    const qr = data?.qrcode ?? data?.qr ?? data?.base64 ?? null;
    return qr ? { qrcode: qr } : null;
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
