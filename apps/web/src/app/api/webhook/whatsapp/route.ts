import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  extractVehicleFromImage,
  extractVehicleFromText,
} from "@/lib/ai";
import { generateVehicleHash } from "@/lib/deduplication";
import { applyFilters } from "@/lib/vehicle-parser";
import { rateLimit } from "@/lib/rate-limit";

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
    const isUazapiFormat = !!raw.wa_chatid || !!raw.EventType;

    let groupJid: string | null = null;
    let messageId: string;
    let isFromMe = false;
    let pushName: string | null = null;
    let textContent: string | null = null;
    let imageUrl: string | null = null;

    if (isUazapiFormat) {
      // UAZAPI flat format
      const event = raw.EventType || raw.event || "messages";
      if (event !== "messages") {
        return NextResponse.json({ status: "ignored", reason: "event_type" });
      }

      groupJid = raw.wa_chatid || null;
      messageId = raw.messageId || raw.stanzaID || raw.id || ("uazapi_" + Date.now());
      isFromMe = raw.fromMe === true || raw.fromMe === "true";
      pushName = raw.senderName || raw.pushName || null;

      // Extract text from UAZAPI fields
      const msgType = raw.wa_lastMessageType || raw.messageType || "";
      if (msgType === "Conversation" || msgType === "ExtendedTextMessage") {
        textContent = raw.content || raw.wa_lastMessageTextVote || raw.text || null;
      } else if (msgType === "ImageMessage") {
        // Image: content may have caption, URL is in imagePreview or content URL
        const contentUrl = raw.content || "";
        if (contentUrl.startsWith("http")) {
          imageUrl = contentUrl;
        }
        textContent = raw.wa_lastMessageTextVote || raw.caption || null;
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
    if (imageUrl && !textContent) {
      const ALBUM_WINDOW_MS = 90_000; // 90 seconds
      const recentVehicle = await prisma.vehicle.findFirst({
        where: {
          sourceGroupId: groupJid,
          capturedAt: { gte: new Date(Date.now() - ALBUM_WINDOW_MS) },
        },
        orderBy: { capturedAt: "desc" },
      });

      if (recentVehicle) {
        const existingPhotos: string[] = JSON.parse(recentVehicle.photos || "[]");
        existingPhotos.push(imageUrl);
        await prisma.vehicle.update({
          where: { id: recentVehicle.id },
          data: { photos: JSON.stringify(existingPhotos) },
        });
        return NextResponse.json({
          status: "photo_added",
          vehicleId: recentVehicle.id,
          photoCount: existingPhotos.length,
        });
      }

      // No recent vehicle — try to extract from image alone
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
