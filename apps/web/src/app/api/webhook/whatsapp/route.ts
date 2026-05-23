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
import { checkRejectionPattern, checkBlocklist } from "@/lib/rejection-learning";
import { calculateQualityScore } from "@/lib/quality-score";
import { isVipVehicle } from "@/lib/vip-detection";
import { hashPhoto } from "@/lib/photo-hash";
import { alertVipCaptured, alertHighScore } from "@/lib/telegram";

const WEBHOOK_LIMITER = { name: "webhook", maxRequests: 30, windowSeconds: 60 };

// Simple in-memory lock to prevent concurrent processing of same message
const _processingLock = new Set<string>();

// Buffer for pairing image + caption sent as separate messages.
// Key: `${groupJid}:${senderJid}` -- usa JID unico do remetente (nao nome).
// Suporta MULTIPLAS imagens por sender (album): vendedor pode mandar 1-N
// fotos da interna ANTES de mandar a foto com caption. Sem essa lista, as
// fotos extras se perdiam (so a ultima sobrescrevia a primeira).
interface BufferedMessage {
  imageUrls: string[]; // fila ordenada por chegada (mais antiga primeiro)
  textContent?: string;
  messageId: string;
  senderJid: string;
  timestamp: number;
}
const _pairingBuffer = new Map<string, BufferedMessage>();
const BUFFER_TTL_MS = 5 * 60 * 1000; // 5 min -- vendedor demora a mandar tudo

function cleanExpiredBuffer() {
  const now = Date.now();
  for (const [key, msg] of _pairingBuffer.entries()) {
    if (now - msg.timestamp > BUFFER_TTL_MS) {
      _pairingBuffer.delete(key);
    }
  }
}

// Periodically clean expired buffer entries even when no traffic
if (typeof setInterval !== "undefined") {
  const _bufferTimer = setInterval(cleanExpiredBuffer, 30_000);
  // Don't keep process alive just for this
  if (typeof _bufferTimer.unref === "function") _bufferTimer.unref();
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

    // Reject oversized webhook payloads (max 10MB)
    const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
    if (contentLength > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
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
    // So pareamos se temos o JID do remetente (seguranca -- evita misturar
    // mensagens de pessoas diferentes no mesmo grupo).
    // Suporta album: varias fotos podem ficar aguardando o texto.
    cleanExpiredBuffer();
    const bufferKey = getBufferKey(groupJid, senderJid);
    const buffered = bufferKey ? _pairingBuffer.get(bufferKey) : null;

    // Fotos extras que vao ser anexadas ao Vehicle apos ser criado.
    let extraPhotosFromBuffer: string[] = [];

    if (imageUrl && !textContent && bufferKey) {
      if (buffered?.textContent && (!buffered.imageUrls || buffered.imageUrls.length === 0)) {
        // Texto bufferizado esperando essa foto -- pareia (1a foto vira principal)
        textContent = buffered.textContent;
        _pairingBuffer.delete(bufferKey);
        console.log("[Webhook] PAIRED: imagem + texto do buffer de", senderJid);
      } else {
        // Sem texto pareando: adiciona foto na FILA. Aguarda texto chegar
        // ou Vehicle ser criado pra drenar.
        const existing = buffered ?? { imageUrls: [] as string[], messageId, senderJid: senderJid!, timestamp: Date.now() };
        const urls = existing.imageUrls ?? [];
        if (!urls.includes(imageUrl)) urls.push(imageUrl);
        _pairingBuffer.set(bufferKey, {
          ...existing,
          imageUrls: urls.slice(0, 12), // cap em 12 fotos por seguranca
          timestamp: Date.now(), // refresca o TTL
        });
        console.log(`[Webhook] BUFFERED: imagem #${urls.length} de`, senderJid);
        return NextResponse.json({ status: "buffered", reason: "awaiting_caption", queued: urls.length });
      }
    } else if (!imageUrl && textContent && bufferKey) {
      if (buffered?.imageUrls && buffered.imageUrls.length > 0 && !buffered.textContent) {
        // Texto chegou e tem fotos esperando: usa a 1a como principal e
        // guarda o resto pra anexar depois (album).
        imageUrl = buffered.imageUrls[0];
        extraPhotosFromBuffer = buffered.imageUrls.slice(1);
        _pairingBuffer.delete(bufferKey);
        console.log(
          `[Webhook] PAIRED: texto + ${buffered.imageUrls.length} imagem(s) do buffer de`,
          senderJid,
          extraPhotosFromBuffer.length > 0 ? `(${extraPhotosFromBuffer.length} extras pro album)` : ""
        );
      } else if (textContent.length >= 20) {
        _pairingBuffer.set(bufferKey, {
          imageUrls: [],
          textContent,
          messageId,
          senderJid: senderJid!,
          timestamp: Date.now(),
        });
        console.log("[Webhook] BUFFERED: texto aguardando imagem de", senderJid);
        return NextResponse.json({ status: "buffered", reason: "awaiting_image" });
      }
    }

    // Se ainda nao tem imagem, descarta
    if (!imageUrl) {
      console.log("[Webhook] IGNORED: no_photo for", groupJid);
      return NextResponse.json({ status: "ignored", reason: "no_photo" });
    }

    // === Multi-foto (album): anexa fotos extras a anuncios recentes ===
    // Se chegou foto sem texto, e o mesmo remetente gerou um Vehicle nos
    // ultimos 5 min no mesmo grupo, anexamos a foto ao array .photos.
    // Match primario por sourceSenderJid (JID confiavel de quem postou);
    // fallback por sellerPhone pra anuncios antigos sem o campo novo.
    if (!textContent && imageUrl && senderJid) {
      const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
      const senderDigits = senderJid.replace(/\D/g, "");
      let target = await prisma.vehicle.findFirst({
        where: {
          sourceGroupId: group.groupId,
          capturedAt: { gte: fiveMinAgo },
          OR: [
            { sourceSenderJid: senderJid },
            { sellerPhone: senderJid },
            { sellerPhone: senderDigits },
            { sellerPhone: { contains: senderDigits } },
          ],
        },
        orderBy: { capturedAt: "desc" },
        select: { id: true, photos: true },
      });

      // Fallback: se nada casou por remetente mas existe UM unico anuncio
      // recentissimo (<=90s) no grupo, provavelmente eh o mesmo anuncio
      // (vendedor mandando fotos em sequencia).
      if (!target) {
        const ninetySecAgo = new Date(Date.now() - 90_000);
        const recentInGroup = await prisma.vehicle.findMany({
          where: { sourceGroupId: group.groupId, capturedAt: { gte: ninetySecAgo } },
          orderBy: { capturedAt: "desc" },
          select: { id: true, photos: true },
          take: 2,
        });
        if (recentInGroup.length === 1) {
          target = recentInGroup[0];
          console.log("[Webhook] Multi-photo: fallback -- unico anuncio recente no grupo");
        }
      }

      if (target) {
        // Parse, append, save -- sem chamar GPT
        let currentPhotos: string[] = [];
        try {
          const parsed = JSON.parse(target.photos);
          if (Array.isArray(parsed)) currentPhotos = parsed.filter((p) => typeof p === "string");
        } catch { /* ignore */ }

        if (currentPhotos.length >= 12) {
          console.log(`[Webhook] Multi-photo: vehicle ${target.id} ja tem 12 fotos, ignorando extra`);
          return NextResponse.json({ status: "ignored", reason: "multi_photo_limit" });
        }

        if (!currentPhotos.includes(imageUrl)) {
          currentPhotos.push(imageUrl);
          await prisma.vehicle.update({
            where: { id: target.id },
            data: { photos: JSON.stringify(currentPhotos) },
          });
          console.log(`[Webhook] Multi-photo: foto anexada ao vehicle ${target.id} (total: ${currentPhotos.length})`);
        }

        return NextResponse.json({
          status: "multi_photo_appended",
          vehicleId: target.id,
          totalPhotos: currentPhotos.length,
        });
      }

      // Sem anuncio recente -> rejeita como antes
      return NextResponse.json({ status: "ignored", reason: "image_no_caption" });
    }

    if (!textContent) {
      return NextResponse.json({ status: "ignored", reason: "image_no_caption" });
    }

    // Pre-filter: skip messages too short to be vehicle ads (saves AI cost)
    if (textContent && textContent.length < 20) {
      console.log("[Webhook] IGNORED: text_too_short (", textContent.length, "chars)");
      return NextResponse.json({ status: "ignored", reason: "text_too_short" });
    }

    // Calculate photo hash for duplicate detection
    const photoHash = imageUrl ? hashPhoto(imageUrl) : null;

    // Check if exact same photo was already captured (in last 30 days)
    if (photoHash) {
      const duplicate = await prisma.vehicle.findFirst({
        where: {
          photoHash,
          capturedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          NOT: { id: undefined as never }, // ignore current
        },
      });
      if (duplicate) {
        console.log(`[Webhook] Duplicate photo detected: ${photoHash} (existing: ${duplicate.id})`);
        return NextResponse.json({
          status: "duplicate",
          existingId: duplicate.id,
          photoMatch: true,
        });
      }
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
    // Foto principal + extras vindas do buffer (album: vendedor mandou
    // varias fotos antes/junto da legenda). Limita a 12 pra nao explodir.
    const photos = [imageUrl, ...extraPhotosFromBuffer]
      .filter((p, i, arr) => p && arr.indexOf(p) === i)
      .slice(0, 12);

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

    // --- Filtro de DESCONTO MINIMO DA FIPE ---
    // Carro de repasse precisa estar pelo menos X% abaixo da tabela FIPE
    // (configuravel via setting `min_fipe_discount`, padrao 10%). Abaixo
    // disso nao tem margem -- descarta na captura, nao enche a fila.
    // Se a FIPE nao foi detectada, deixa passar (operador revisa).
    {
      const fipeFromAi = typeof vehicleData.fipePrice === "number" ? vehicleData.fipePrice : null;
      if (fipeFromAi && fipeFromAi > 0) {
        const minDiscSetting = await prisma.setting.findUnique({
          where: { key: "min_fipe_discount" },
        });
        const minDiscount = minDiscSetting ? parseFloat(minDiscSetting.value) : 10;
        const discountPct = (1 - price / fipeFromAi) * 100;
        if (discountPct < minDiscount) {
          console.log(
            `[Webhook] FILTERED low FIPE discount: ${discountPct.toFixed(1)}% < ${minDiscount}% (price ${price} / fipe ${fipeFromAi})`
          );
          return NextResponse.json({
            status: "filtered",
            reason: "fipe_discount_too_low",
            discountPct: Math.round(discountPct * 10) / 10,
            minDiscount,
          });
        }
      }
    }

    // --- Filtro automatico de GRUPOS NACIONAIS ---
    // Grupos "Nacional" recebem carros do Brasil inteiro. Muitos anuncios de
    // FORA da regiao atendida nao mencionam o estado. Regra do cliente:
    // "se nao colocar nada, esta fora". Entao em grupo nacional EXIGIMOS
    // mencao explicita de um estado atendido -- sem isso, descarta.
    const groupRegion = (group.region || "").toUpperCase();
    if (groupRegion === "NACIONAL") {
      const servedSetting = await prisma.setting.findUnique({
        where: { key: "served_states" },
      });
      const servedStates = (servedSetting?.value || "RS,SC,PR,SP")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      const detectedState = state ? state.toUpperCase() : null;

      // Estado nao detectado OU fora da regiao atendida -> descarta.
      // Em grupo nacional, ausencia de estado = presumido fora da regiao.
      if (!detectedState || !servedStates.includes(detectedState)) {
        console.log(
          `[Webhook] FILTERED national group: estado=${detectedState ?? "NAO_DETECTADO"} (atendidos: ${servedStates.join(",")})`
        );
        return NextResponse.json({
          status: "filtered",
          reason: detectedState
            ? "national_group_state_not_served"
            : "national_group_no_state_mentioned",
          state: detectedState ?? "nao_detectado",
          servedStates,
        });
      }
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

    // Blocklist check
    let autoRejectedReason: string | null = null;
    if (textContent) {
      const blockedKw = await checkBlocklist(textContent);
      if (blockedKw) {
        autoRejectedReason = `blocklist:${blockedKw}`;
      }
    }

    // Rejection pattern check
    if (!autoRejectedReason) {
      const pattern = await checkRejectionPattern({ model, year, km, fipePrice, price });
      if (pattern.matched) {
        autoRejectedReason = `learned:${pattern.reason}:${pattern.similarCount}_similares`;
      }
    }

    // Quality score
    const { score: qualityScore } = calculateQualityScore({ km, year, price, fipePrice, rawDescription: textContent });

    // VIP detection
    const isVip = await isVipVehicle(model, brand);

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
        sourceSenderJid: senderJid, // JID de quem postou -- usado pra agrupar fotos extras
        vehicleHash,
        photoHash,
        qualityScore,
        isVip,
        autoRejectedReason,
        status: autoRejectedReason ? "REJECTED" : "PENDING",
        rejectedAt: autoRejectedReason ? new Date() : null,
        rejectionReason: autoRejectedReason ? `Auto: ${autoRejectedReason}` : null,
      },
    });

    // Fire-and-forget Telegram alerts for noteworthy captures
    if (isVip && !autoRejectedReason) {
      void alertVipCaptured(model, year, price).catch(() => {});
    }
    if (qualityScore && qualityScore >= 8 && !autoRejectedReason) {
      void alertHighScore(model, year, qualityScore).catch(() => {});
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
