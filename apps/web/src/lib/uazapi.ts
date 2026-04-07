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
// Client
// ---------------------------------------------------------------------------

class UazapiClient {
  private _client: AxiosInstance | null = null;

  private get client(): AxiosInstance {
    if (!this._client) {
      const baseURL = process.env.UAZAPI_BASE_URL;
      const token = process.env.UAZAPI_TOKEN;

      if (!baseURL) {
        throw new Error("UAZAPI_BASE_URL environment variable is not set");
      }
      if (!token) {
        throw new Error("UAZAPI_TOKEN environment variable is not set");
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

  /**
   * List all WhatsApp groups the connected number participates in.
   * @param force - If true, forces a refresh from WhatsApp servers.
   */
  async listGroups(force?: boolean): Promise<GroupInfo[]> {
    const { data } = await this.client.get("/group/list", {
      params: { force: force ?? false, noparticipants: true },
    });

    // UAZAPI returns { groups: [...] } with JID/Name format
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

  /**
   * Send a text message to a number or group.
   */
  async sendText(payload: SendTextPayload): Promise<SendResult> {
    const { data } = await this.client.post<SendResult>(
      "/send/text",
      payload
    );
    return data;
  }

  /**
   * Send a media message (image, video, or document) to a number or group.
   */
  async sendMedia(payload: SendMediaPayload): Promise<SendResult> {
    const { data } = await this.client.post<SendResult>(
      "/send/media",
      payload
    );
    return data;
  }

  /**
   * Send a presence indicator (composing, recording, paused) to a chat.
   */
  async sendPresence(payload: SendPresencePayload): Promise<void> {
    await this.client.post("/message/presence", payload);
  }

  /**
   * Get the current connection status of the WhatsApp instance.
   */
  async getStatus(): Promise<{ state: string; phone?: string }> {
    const { data } = await this.client.get("/instance/status");
    return {
      state: data?.state ?? data?.status ?? "unknown",
      phone: data?.phone ?? data?.number ?? undefined,
    };
  }

  /**
   * Get the QR code for connecting a WhatsApp number.
   * Returns base64 QR code string or null if already connected.
   */
  async getQR(): Promise<{ qrcode: string } | null> {
    const { data } = await this.client.get("/instance/qr");
    const qr = data?.qrcode ?? data?.qr ?? data?.base64 ?? null;
    return qr ? { qrcode: qr } : null;
  }

  /**
   * Disconnect the current WhatsApp session.
   */
  async logout(): Promise<void> {
    await this.client.delete("/instance/logout");
  }

  /**
   * Download media from a WhatsApp message using UAZAPI /message/download.
   * Returns { base64Data, fileURL, mimetype } or null.
   */
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
      console.error("[UAZAPI] Failed to download media:", err);
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const uazapi = new UazapiClient();
