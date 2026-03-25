import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  extractVehicleFromImage,
  extractVehicleFromText,
} from "@/lib/ai";
import { generateVehicleHash } from "@/lib/deduplication";
import { applyFilters } from "@/lib/vehicle-parser";
import { rateLimit } from "@/lib/rate-limit";
import { uazapi } from "@/lib/uazapi";
import { persistImage } from "@/lib/media-storage";

const WEBHOOK_LIMITER = { name: "webhook", maxRequests: 30, windowSeconds: 60 };

interface WebhookPayload {
  event: string;
  data: {
    key: {
      remoteJid: string;
      id: string;
      fromMe: boolean;
    };
    message: {
      conversation?: string;
      imageMessage?: {
        url: string;
        caption?: string;
        mimetype: string;
      };
      extendedTextMessage?: {
        text: string;
      };
    };
    pushName?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    // Webhook secret verification
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (webhookSecret) {
      const headerSecret =
        request.headers.get("x-webhook-secret") ||
        request.nextUrl.searchParams.get("secret");

      if (!headerSecret || headerSecret !== webhookSecret) {
        console.warn("[Webhook] Invalid or missing webhook secret");
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    // Rate limiting by IP
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const rl = rateLimit(WEBHOOK_LIMITER, ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    const raw = await request.json();
    console.log("[Webhook] Received:", JSON.stringify(raw).substring(0, 2000));

    // ── Normalize: UAZAPI flat format vs standard nested format ──
    // UAZAPI sends: { BaseUrl, EventType, chat: { wa_chatid, wa_lastMessageTextVote, ... }, message: {...} }
    const chat = raw.chat || {};
    const isUazapiFormat = !!raw.EventType || !!chat.wa_chatid;

    let groupJid: string | null = null;
    let messageId: string;
    let isFromMe = false;
    let pushName: string | null = null;
    let textContent: string | null = null;
    let imageUrl: string | null = null;

    if (isUazapiFormat) {
      const event = raw.EventType || "messages";
      if (event !== "messages") {
        return NextResponse.json({ status: "ignored", reason: "event_type" });
      }

      // Fields are inside chat object
      groupJid = chat.wa_chatid || chat.chatid || null;
      messageId = chat.stanzaID || chat.messageId || raw.id || ("uazapi_" + Date.now());
      isFromMe = chat.fromMe === true || chat.fromMe === "true";
      pushName = chat.senderName || chat.pushName || chat.wa_name || null;

      // Extract text based on message type
      const msgType = chat.wa_lastMessageType || chat.messageType || "";
      const content = chat.content || "";

      if (msgType === "Conversation" || msgType === "ExtendedTextMessage") {
        textContent = content || chat.wa_lastMessageTextVote || null;
      } else if (msgType === "ImageMessage" || msgType === "VideoMessage") {
        // Find the WhatsApp stanzaID for /message/download
        // It can be in: content.contextInfo.stanzaID, message.contextInfo.stanzaID, or chat.stanzaID
        let contentObj: Record<string, unknown> | null = null;
        if (typeof content === "object" && content !== null) {
          contentObj = content;
        } else if (typeof content === "string" && content.startsWith("{")) {
          try { contentObj = JSON.parse(content); } catch { /* ignore */ }
        }

        // Try multiple ID sources for /message/download
        const ctxInfo = contentObj?.contextInfo as Record<string, unknown> | undefined;
        const msgCtxInfo = raw.message?.contextInfo as Record<string, unknown> | undefined;

        const waMessageId =
          ctxInfo?.stanzaID ||
          ctxInfo?.stanzaId ||
          msgCtxInfo?.stanzaID ||
          msgCtxInfo?.stanzaId ||
          chat.stanzaID ||
          raw.message?.messageId ||
          raw.message?.id ||
          null;

        // Log all available IDs for debugging
        console.log("[Webhook] ImageMessage IDs - stanzaID:", waMessageId, "raw.id:", raw.id,
          "msg.id:", raw.message?.id, "contextInfo keys:", ctxInfo ? Object.keys(ctxInfo).join(",") : "none");

        if (waMessageId) {
          try {
            const media = await uazapi.downloadMedia(waMessageId as string);
            if (media) {
              // Use the public fileURL from UAZAPI (permanent, no expiration)
              if (media.fileURL) {
                imageUrl = media.fileURL;
                console.log("[Webhook] Got UAZAPI fileURL:", media.fileURL.substring(0, 80));
              } else if (media.base64Data) {
                const mType = media.mimetype === "application/octet-stream" ? "image/jpeg" : media.mimetype;
                imageUrl = `data:${mType};base64,${media.base64Data}`;
                console.log("[Webhook] Got UAZAPI base64, size:", media.base64Data.length);
              }
            }
          } catch (err) {
            console.warn("[Webhook] UAZAPI download failed:", err);
          }
        }

        // Fallback: try other IDs
        const fallbackIds = [raw.id, raw.message?.id, raw.message?.messageId, chat.messageId].filter(Boolean);
        for (const fbId of fallbackIds) {
          if (imageUrl) break;
          try {
            const media = await uazapi.downloadMedia(fbId);
            if (media?.fileURL) {
              imageUrl = media.fileURL;
              console.log("[Webhook] Got UAZAPI fileURL via fallback ID:", fbId, media.fileURL.substring(0, 80));
            }
          } catch { /* ignore */ }
        }

        // Last resort: use CDN URL directly and persist (may be encrypted but worth trying)
        if (!imageUrl) {
          const cdnUrl = contentObj?.URL as string || (typeof content === "string" && content.startsWith("http") ? content : null);
          if (cdnUrl) {
            imageUrl = cdnUrl;
            console.warn("[Webhook] Using CDN URL as last resort:", cdnUrl.substring(0, 80));
          }
        }

        textContent = chat.wa_lastMessageTextVote || chat.caption || null;
      }

      // Fallback: try text from any field
      if (!textContent) {
        const fallback = chat.wa_lastMessageTextVote || content || null;
        if (fallback && typeof fallback === "string" && !fallback.startsWith("http")) {
          textContent = fallback;
        }
      }

      // Also try message object if present
      if (raw.message) {
        if (!textContent && raw.message.conversation) {
          textContent = raw.message.conversation;
        }
        if (!textContent && raw.message.extendedTextMessage?.text) {
          textContent = raw.message.extendedTextMessage.text;
        }
        if (raw.message.imageMessage) {
          imageUrl = imageUrl || raw.message.imageMessage.url || null;
          textContent = textContent || raw.message.imageMessage.caption || null;
        }
      }
    } else {
      // Standard nested format
      const event = raw.event || "messages";
      if (event !== "messages.upsert" && event !== "messages") {
        return NextResponse.json({ status: "ignored", reason: "event_type" });
      }

      const data = raw.data || raw;
      const key = data.key || {};
      const message = data.message || {};
      groupJid = key.remoteJid || null;
      messageId = key.id || ("std_" + Date.now());
      isFromMe = !!key.fromMe;
      pushName = data.pushName || null;
      textContent = message.conversation || message.extendedTextMessage?.text || message.imageMessage?.caption || null;
      imageUrl = message.imageMessage?.url || null;
    }

    console.log("[Webhook] Parsed:", { groupJid, messageId, isFromMe, pushName, textContent: textContent?.substring(0, 100), imageUrl: !!imageUrl });

    // ── Persist image immediately (CDN URLs expire in minutes) ──
    if (imageUrl && imageUrl.startsWith("http")) {
      const persistedUrl = await persistImage(imageUrl);
      if (persistedUrl !== imageUrl) {
        console.log("[Webhook] Image persisted:", persistedUrl);
        imageUrl = persistedUrl;
      } else {
        console.warn("[Webhook] Failed to persist image, keeping CDN URL");
      }
    }

    // ── Validate ──
    if (!groupJid || !groupJid.endsWith("@g.us")) {
      return NextResponse.json({ status: "ignored", reason: "not_group" });
    }

    if (isFromMe) {
      return NextResponse.json({ status: "ignored", reason: "own_message" });
    }

    const group = await prisma.whatsAppGroup.findUnique({
      where: { groupId: groupJid },
    });

    if (!group || group.role !== "SOURCE" || !group.active) {
      return NextResponse.json({
        status: "ignored",
        reason: "group_not_monitored",
      });
    }

    const existingMessage = await prisma.vehicle.findFirst({
      where: { sourceMessageId: messageId },
    });

    if (existingMessage) {
      return NextResponse.json({
        status: "ignored",
        reason: "duplicate_message",
      });
    }

    // ── Album handling: image without caption → attach to recent vehicle ──
    const ALBUM_WINDOW_MS = 180_000; // 3 minutes

    if (imageUrl && !textContent) {
      // Find recent vehicle from same group (and same sender if known)
      const albumWhere: Record<string, unknown> = {
        sourceGroupId: groupJid,
        status: { not: "PHOTO_PENDING" },
        capturedAt: { gte: new Date(Date.now() - ALBUM_WINDOW_MS) },
      };
      if (pushName) {
        albumWhere.sellerPhone = pushName;
      }
      const recentVehicle = await prisma.vehicle.findFirst({
        where: albumWhere,
        orderBy: { capturedAt: "desc" },
      });

      if (recentVehicle) {
        const existingPhotos: string[] = JSON.parse(recentVehicle.photos || "[]");
        if (!existingPhotos.includes(imageUrl)) {
          existingPhotos.push(imageUrl);
          await prisma.vehicle.update({
            where: { id: recentVehicle.id },
            data: { photos: JSON.stringify(existingPhotos) },
          });
        }
        return NextResponse.json({
          status: "photo_added",
          vehicleId: recentVehicle.id,
          photoCount: existingPhotos.length,
        });
      }

      // No recent vehicle — store as orphan photo for later association
      // We store it temporarily as a vehicle stub with status PHOTO_PENDING
      await prisma.vehicle.create({
        data: {
          model: "__PHOTO_PENDING__",
          year: 0,
          km: 0,
          price: 0,
          vehicleHash: "photo_" + messageId,
          photos: JSON.stringify([imageUrl]),
          sourceGroupId: groupJid,
          sourceMessageId: messageId,
          sellerPhone: pushName || null,
          status: "PHOTO_PENDING",
        },
      });
      return NextResponse.json({ status: "photo_stored", messageId });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let vehicleData: any = null;

    if (imageUrl) {
      vehicleData = await extractVehicleFromImage(imageUrl, textContent ?? undefined);
    } else if (textContent) {
      vehicleData = await extractVehicleFromText(textContent);
    }

    if (!vehicleData) {
      return NextResponse.json({
        status: "ignored",
        reason: "no_vehicle_data",
      });
    }

    const model = vehicleData.model as string;
    const brand = (vehicleData.brand as string) || null;
    const year = vehicleData.year as number;
    const yearModel = (vehicleData.yearModel as number) || year;
    const km = vehicleData.km as number;
    const price = vehicleData.price as number;
    const transmission = (vehicleData.transmission as string) || null;
    const fuel = (vehicleData.fuel as string) || null;
    const color = (vehicleData.color as string) || null;
    const plate = (vehicleData.plate as string) || null;
    const location = (vehicleData.location as string) || null;
    const state = (vehicleData.state as string) || null;
    const features = (vehicleData.features as string[]) || [];
    const photos = imageUrl ? [imageUrl] : [];

    if (!model || !year || km === undefined || !price) {
      return NextResponse.json({
        status: "ignored",
        reason: "incomplete_data",
        missing: {
          model: !model,
          year: !year,
          km: km === undefined,
          price: !price,
        },
      });
    }

    // Filtro global de ano minimo (configuravel via Settings, padrao 2018)
    const minYearSetting = await prisma.setting.findUnique({
      where: { key: "filter_min_year" },
    });
    const parsed = minYearSetting ? parseInt(minYearSetting.value, 10) : NaN;
    const minYear = isNaN(parsed) ? 2018 : parsed;

    if (year < minYear) {
      return NextResponse.json({
        status: "filtered",
        reason: "vehicle_too_old",
        year,
        minYear,
      });
    }

    const groupFilters = group.filters ? JSON.parse(group.filters) : null;
    if (groupFilters) {
      // State filter: if group has allowedStates, only accept vehicles from those states
      if (groupFilters.allowedStates && groupFilters.allowedStates.length > 0 && state) {
        const allowed = (groupFilters.allowedStates as string[]).map((s: string) => s.toUpperCase());
        if (!allowed.includes(state.toUpperCase())) {
          return NextResponse.json({
            status: "filtered",
            reason: "state_not_allowed",
            state,
            allowedStates: allowed,
          });
        }
      }

      const passesFilters = applyFilters(
        { model, brand: brand ?? undefined, year, km, price, transmission: transmission ?? undefined, fuel: fuel ?? undefined, features: features, photos },
        groupFilters
      );

      if (!passesFilters) {
        return NextResponse.json({
          status: "filtered",
          reason: "group_filters",
        });
      }
    }

    const vehicleHash = generateVehicleHash({
      model,
      year,
      km,
      price,
    });

    const existingVehicle = await prisma.vehicle.findFirst({
      where: { vehicleHash },
    });

    if (existingVehicle) {
      return NextResponse.json({
        status: "duplicate",
        existingId: existingVehicle.id,
      });
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        model,
        brand,
        year,
        yearModel,
        km,
        price,
        transmission,
        fuel,
        color,
        plate,
        location,
        state,
        features: JSON.stringify(features),
        photos: JSON.stringify(photos),
        rawDescription: textContent,
        sourceGroupId: groupJid,
        sourceMessageId: messageId,
        sellerPhone: pushName || null,
        vehicleHash,
        status: "PENDING",
      },
    });

    // ── Reverse album: collect orphan photos sent BEFORE the text (same group + sender) ──
    const orphanWhere: Record<string, unknown> = {
      sourceGroupId: groupJid,
      status: "PHOTO_PENDING",
      createdAt: { gte: new Date(Date.now() - ALBUM_WINDOW_MS) },
    };
    // Only match same sender to avoid mixing albums from different people
    if (pushName) {
      orphanWhere.sellerPhone = pushName;
    }
    const orphanPhotos = await prisma.vehicle.findMany({ where: orphanWhere });

    if (orphanPhotos.length > 0) {
      const allPhotos: string[] = JSON.parse(vehicle.photos || "[]");
      for (const orphan of orphanPhotos) {
        const orphanPhotosArr: string[] = JSON.parse(orphan.photos || "[]");
        for (const url of orphanPhotosArr) {
          if (!allPhotos.includes(url)) allPhotos.push(url);
        }
      }
      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { photos: JSON.stringify(allPhotos) },
      });
      // Delete orphan stubs
      await prisma.vehicle.deleteMany({
        where: { id: { in: orphanPhotos.map((o) => o.id) } },
      });
      console.log(`[Webhook] Attached ${orphanPhotos.length} orphan photo(s) to vehicle ${vehicle.id}`);
    }

    await prisma.auditLog.create({
      data: {
        action: "VEHICLE_CAPTURED",
        entityType: "Vehicle",
        entityId: vehicle.id,
        vehicleId: vehicle.id,
        details: JSON.stringify({
          source: group.name,
          groupJid,
          messageId,
          sender: pushName,
        }),
      },
    });

    return NextResponse.json(
      {
        status: "captured",
        vehicleId: vehicle.id,
        model: vehicle.model,
        year: vehicle.year,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Webhook] Error processing WhatsApp webhook:", error);
    return NextResponse.json(
      { error: "Erro ao processar webhook" },
      { status: 500 }
    );
  }
}
