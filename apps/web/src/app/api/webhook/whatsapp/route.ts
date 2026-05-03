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

// Simple in-memory lock to prevent concurrent processing of same message
const _processingLock = new Set<string>();

// Buffer for pairing image + caption sent as separate messages
// Key: `${groupJid}:${senderJid}` — usa JID unico do remetente (nao nome)
// Value: { imageUrl, textContent, messageId, timestamp }
interface BufferedMessage {
  imageUrl?: string;
  textContent?: string;
  messageId: string;
  senderJid: string;
  timestamp: number;
}
const _pairingBuffer = new Map<string, BufferedMessage>();
const BUFFER_TTL_MS = 60 * 1000; // 60 seconds

function cleanExpiredBuffer() {
  const now = Date.now();
  for (const [key, msg] of _pairingBuffer.entries()) {
    if (now - msg.timestamp > BUFFER_TTL_MS) {
      _pairingBuffer.delete(key);
    }
  }
}

function getBufferKey(groupJid: string, senderJid: string | null): string {
  // Sem JID do remetente, nao fazemos pareamento (seguranca)
  if (!senderJid) return "";
  return `${groupJid}:${senderJid}`;
}

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
    if (!webhookSecret && process.env.NODE_ENV === "production") {
      console.error("[Webhook] WEBHOOK_SECRET is not set! Rejecting all requests in production.");
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }
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
    const msgType = raw.chat?.wa_lastMessageType || raw.event || "unknown";
    console.log("[Webhook]", raw.chat?.wa_chatid || raw.data?.key?.remoteJid || "?", raw.chat?.stanzaID || raw.data?.key?.id || "?", msgType);

    // ── Normalize: UAZAPI flat format vs standard nested format ──
    // UAZAPI sends: { BaseUrl, EventType, chat: { wa_chatid, wa_lastMessageTextVote, ... }, message: {...} }
    const chat = raw.chat || {};
    const isUazapiFormat = !!raw.EventType || !!chat.wa_chatid;

    let groupJid: string | null = null;
    let messageId: string;
    let isFromMe = false;
    let pushName: string | null = null;
    let senderJid: string | null = null;
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
      // JID unico do remetente (para pareamento de mensagens)
      senderJid = chat.wa_lastMessageSender || chat.senderJid || chat.participant || null;

      // Extract text based on message type
      const msgType = chat.wa_lastMessageType || chat.messageType || "";
      const content = chat.content || "";

      if (msgType === "Conversation" || msgType === "ExtendedTextMessage") {
        textContent = content || chat.wa_lastMessageTextVote || null;
      } else if (msgType === "VideoMessage") {
        // Videos: extract caption/text only, do not download media
        textContent = chat.wa_lastMessageTextVote || chat.caption || null;
      } else if (msgType === "ImageMessage") {
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

        if (process.env.NODE_ENV === "development") {
          console.log("[Webhook] ImageMessage IDs - stanzaID:", waMessageId, "contextInfo keys:", ctxInfo ? Object.keys(ctxInfo).join(",") : "none");
        }

        if (waMessageId) {
          try {
            const media = await uazapi.downloadMedia(waMessageId as string);
            if (media) {
              const mType = media.mimetype === "application/octet-stream" ? "image/jpeg" : media.mimetype;
              if (media.base64Data) {
                imageUrl = `data:${mType};base64,${media.base64Data}`;
                console.log("[Webhook] Image downloaded OK");
              } else if (media.fileURL) {
                imageUrl = media.fileURL;
                console.log("[Webhook] Image downloaded OK (URL)");
              }
            }
          } catch (err) {
            console.warn("[Webhook] UAZAPI download failed:", err);
          }
        }

        // REMOVED: fallback ID download loop — caused photo mismatch
        // (downloading wrong image from different message IDs)

        // If primary download failed, skip this message (no photo = no capture)
        if (!imageUrl) {
          console.warn("[Webhook] Image download failed for stanzaID:", waMessageId, "- skipping");
        }

        // Caption pode estar em varios lugares no payload UAZAPI
        textContent =
          (contentObj?.caption as string) ||
          (contentObj?.text as string) ||
          chat.wa_lastMessageTextVote ||
          chat.wa_lastMessageText ||
          chat.caption ||
          chat.text ||
          null;
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

    if (process.env.NODE_ENV === "development") {
      console.log("[Webhook] Parsed:", { groupJid, messageId, isFromMe, hasImage: !!imageUrl });
    }

    // Prevent concurrent processing of same message
    if (_processingLock.has(messageId)) {
      return NextResponse.json({ status: "ignored", reason: "already_processing" });
    }
    _processingLock.add(messageId);

    try {
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
    const isGroup = groupJid?.endsWith("@g.us");
    const isBroadcast = groupJid?.endsWith("@broadcast") || groupJid?.endsWith("@newsletter");
    if (!groupJid || (!isGroup && !isBroadcast)) {
      return NextResponse.json({ status: "ignored", reason: "not_group" });
    }

    if (isFromMe) {
      return NextResponse.json({ status: "ignored", reason: "own_message" });
    }

    let group = await prisma.whatsAppGroup.findUnique({
      where: { groupId: groupJid },
    });

    // Capturar flags do UAZAPI (wa_isGroup_community, wa_isGroup_announce)
    const isCommunity = chat?.wa_isGroup_community === true;
    const isAnnounce = chat?.wa_isGroup_announce === true;
    const chatName = chat?.wa_name || chat?.name || raw.message?.groupName || pushName || groupJid.replace(/@.*/, "");

    // Auto-register new groups/broadcast lists as SOURCE (inactive by default)
    if (!group && (isGroup || isBroadcast)) {
      const prefix = isAnnounce ? "Canal: " : isBroadcast ? "Lista: " : isCommunity ? "Comunidade: " : "";
      group = await prisma.whatsAppGroup.create({
        data: {
          groupId: groupJid,
          name: prefix + chatName,
          role: "SOURCE",
          active: true,
          isCommunity,
          isAnnounce,
          ownerPhone: chat?.owner || null,
        },
      });
      console.log(`[Webhook] Auto-registered ${isAnnounce ? "channel" : isCommunity ? "community" : isBroadcast ? "broadcast" : "group"}: ${group.name} (${groupJid})`);
    } else if (group) {
      // Atualiza flags se mudaram
      const needsUpdate =
        group.isCommunity !== isCommunity ||
        group.isAnnounce !== isAnnounce ||
        (chat?.owner && !group.ownerPhone);
      if (needsUpdate) {
        await prisma.whatsAppGroup.update({
          where: { id: group.id },
          data: {
            isCommunity,
            isAnnounce,
            ownerPhone: group.ownerPhone || chat?.owner || null,
          },
        });
      }
    }

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

    // === Buffer pairing: juntar foto + texto enviados separadamente ===
    // So pareamos se temos o JID do remetente (seguranca — evita misturar
    // mensagens de pessoas diferentes no mesmo grupo)
    cleanExpiredBuffer();
    const bufferKey = getBufferKey(groupJid, senderJid);
    const buffered = bufferKey ? _pairingBuffer.get(bufferKey) : null;

    if (imageUrl && !textContent && bufferKey) {
      // Foto sem legenda — verifica se tem texto aguardando do MESMO remetente
      if (buffered?.textContent && !buffered.imageUrl) {
        textContent = buffered.textContent;
        _pairingBuffer.delete(bufferKey);
        console.log("[Webhook] PAIRED: imagem + texto do buffer de", senderJid);
      } else {
        // Guarda imagem no buffer aguardando texto (60s)
        _pairingBuffer.set(bufferKey, { imageUrl, messageId, senderJid: senderJid!, timestamp: Date.now() });
        console.log("[Webhook] BUFFERED: imagem aguardando texto de", senderJid);
        return NextResponse.json({ status: "buffered", reason: "awaiting_caption" });
      }
    } else if (!imageUrl && textContent && bufferKey) {
      // Texto sem foto — verifica se tem imagem aguardando do MESMO remetente
      if (buffered?.imageUrl && !buffered.textContent) {
        imageUrl = buffered.imageUrl;
        _pairingBuffer.delete(bufferKey);
        console.log("[Webhook] PAIRED: texto + imagem do buffer de", senderJid);
      } else if (textContent.length >= 20) {
        _pairingBuffer.set(bufferKey, { textContent, messageId, senderJid: senderJid!, timestamp: Date.now() });
        console.log("[Webhook] BUFFERED: texto aguardando imagem de", senderJid);
        return NextResponse.json({ status: "buffered", reason: "awaiting_image" });
      }
    }

    // Se ainda nao tem imagem, descarta
    if (!imageUrl) {
      console.log("[Webhook] IGNORED: no_photo for", groupJid);
      return NextResponse.json({ status: "ignored", reason: "no_photo" });
    }
    if (!textContent) {
      return NextResponse.json({ status: "ignored", reason: "image_no_caption" });
    }

    // Pre-filter: skip messages too short to be vehicle ads (saves AI cost)
    if (textContent && textContent.length < 20) {
      console.log("[Webhook] IGNORED: text_too_short (", textContent.length, "chars)");
      return NextResponse.json({ status: "ignored", reason: "text_too_short" });
    }

    // Pre-filter: must contain at least one vehicle-related keyword
    if (textContent) {
      const lower = textContent.toLowerCase();
      const hasVehicleKeyword = /\b(km|mil|ano|preco|valor|fipe|cambio|automatico|manual|flex|diesel|hibrido|\d{4}\/\d{2,4}|\d{2,3}\s*mil)\b/i.test(lower);
      if (!hasVehicleKeyword) {
        console.log("[Webhook] IGNORED: no_vehicle_keywords for", textContent.substring(0, 80));
        return NextResponse.json({ status: "ignored", reason: "no_vehicle_keywords" });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let vehicleData: any = null;

    try {
      vehicleData = await extractVehicleFromImage(imageUrl, textContent ?? undefined);
    } catch (err) {
      console.error("[Webhook] AI extraction failed:", err);
      return NextResponse.json({ status: "error", reason: "ai_extraction_failed" }, { status: 502 });
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
    const yearModel = (vehicleData.yearModel as number) ?? year;
    const km = vehicleData.km as number;
    const price = vehicleData.price as number;
    const transmission = (vehicleData.transmission as string) || null;
    const fuel = (vehicleData.fuel as string) || null;
    const color = (vehicleData.color as string) || null;
    const plate = (vehicleData.plate as string) || null;
    const location = (vehicleData.location as string) || null;
    const state = (vehicleData.state as string) || null;
    // Clone para nao poluir cache de extracao da AI (mesmo objeto e reutilizado)
    const features = [...((vehicleData.features as string[]) || [])];
    if (plate) {
      features.push("⚠️ PLACA VISÍVEL");
    }
    const photos = [imageUrl];

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

    // Filtro global de preco minimo (configuravel via Settings, padrao R$30.000)
    const minPriceSetting = await prisma.setting.findUnique({
      where: { key: "filter_min_price" },
    });
    const parsedMinPrice = minPriceSetting ? parseFloat(minPriceSetting.value) : NaN;
    const minPrice = isNaN(parsedMinPrice) ? 30000 : parsedMinPrice;

    if (price < minPrice) {
      return NextResponse.json({
        status: "filtered",
        reason: "vehicle_price_too_low",
        price,
        minPrice,
      });
    }

    let groupFilters = null;
    try {
      groupFilters = group.filters ? JSON.parse(group.filters) : null;
    } catch {
      console.warn("[Webhook] Invalid JSON in group.filters for", group.name);
    }
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

    const fipePrice = (vehicleData.fipePrice as number) ?? null;

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
      // If new price is lower (better margin), update the existing vehicle
      if (price < existingVehicle.price && existingVehicle.status === "PENDING") {
        await prisma.vehicle.update({
          where: { id: existingVehicle.id },
          data: {
            price,
            fipePrice: fipePrice ?? existingVehicle.fipePrice,
            rawDescription: textContent ?? existingVehicle.rawDescription,
            sellerPhone: (vehicleData.sellerPhone as string) || existingVehicle.sellerPhone,
          },
        });
        console.log(`[Webhook] Updated duplicate with lower price: ${existingVehicle.id} (${existingVehicle.price} → ${price})`);
        return NextResponse.json({ status: "updated", existingId: existingVehicle.id, oldPrice: existingVehicle.price, newPrice: price });
      }
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
        fipePrice,
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
        sellerPhone: (vehicleData.sellerPhone as string) || pushName || null,
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
    } finally {
      _processingLock.delete(messageId);
    }
  } catch (error) {
    console.error("[Webhook] Error processing WhatsApp webhook:", error);
    return NextResponse.json(
      { error: "Erro ao processar webhook" },
      { status: 500 }
    );
  }
}
