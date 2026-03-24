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

    const rawPayload = await request.json();
    console.log("[Webhook] Received:", JSON.stringify(rawPayload).substring(0, 500));

    // UAZAPI may send data at root level or nested under "data"
    const payload: WebhookPayload = rawPayload.data?.key
      ? rawPayload
      : { event: rawPayload.event || "messages", data: rawPayload };

    const event = payload.event;
    if (event !== "messages.upsert" && event !== "messages") {
      return NextResponse.json({ status: "ignored", reason: "event_type" });
    }

    const { data } = payload;
    const { key, message, pushName } = data;
    const groupJid = key.remoteJid;
    const messageId = key.id;

    if (!groupJid || !groupJid.endsWith("@g.us")) {
      return NextResponse.json({ status: "ignored", reason: "not_group" });
    }

    if (key.fromMe) {
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

    const textContent =
      message.conversation ||
      message.extendedTextMessage?.text ||
      message.imageMessage?.caption ||
      null;

    const imageUrl = message.imageMessage?.url || null;

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
