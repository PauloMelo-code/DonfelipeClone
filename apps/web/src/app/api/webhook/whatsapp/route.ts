import { NextRequest, NextResponse } from "next/server";
import { eq, gte, asc } from "drizzle-orm";
import { db, veiculos, carimboDeEdicao, vivosE } from "@/lib/db";
import { registrarAuditoria } from "@/lib/audit";
import { extractVehicleFromImage } from "@/lib/ai";
import {
  generateVehicleHash,
  generateVehicleIdentityHash,
  findFuzzyDuplicate,
} from "@/lib/deduplication";
import { rateLimit } from "@/lib/rate-limit";
import { extractRequestMeta } from "@/lib/request-meta";
import { checkMachineSecret } from "@/lib/machine-auth";
import { normalizarPayload } from "@/lib/webhook/normalizar";
import { parear } from "@/lib/webhook/parear";
import { aplicarFiltros } from "@/lib/webhook/filtros";
import { resolverGrupo } from "@/lib/webhook/grupo";
import { anexarFotoExtra } from "@/lib/webhook/album";
import {
  gerarAnuncioEmBackground,
  analisarFotosEmBackground,
} from "@/lib/webhook/pos-captura";
import { persistImage } from "@/lib/media-storage";
import { checkRejectionPattern, checkBlocklist } from "@/lib/rejection-learning";
import { calculateQualityScore } from "@/lib/quality-score";
import { isVipVehicle } from "@/lib/vip-detection";
import { hashPhoto } from "@/lib/photo-hash";

const WEBHOOK_LIMITER = { name: "webhook", maxRequests: 30, windowSeconds: 60 };

// Simple in-memory lock to prevent concurrent processing of same message
const _processingLock = new Set<string>();


export async function POST(request: NextRequest) {
  try {
    // Credencial de maquina: cabecalho, tempo constante, fail-closed em
    // QUALQUER ambiente. Antes, a ausencia de WEBHOOK_SECRET deixava a rota
    // aberta fora de producao, e a comparacao era `!==` sobre string.
    const cred = checkMachineSecret(request, {
      headerName: "x-webhook-secret",
      envVar: "WEBHOOK_SECRET",
      queryParam: "secret",
    });
    if (!cred.ok) {
      console.warn(`[Webhook] Credencial recusada: ${cred.motivo}`);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Teto por IP, pela leitura canonica -- a mesma do login e da trilha.
    // A copia que havia aqui pegava o primeiro valor do `x-forwarded-for`, que
    // e o que o cliente escreve: bastava rodar o cabecalho para zerar o
    // contador.
    const { ipAddress } = extractRequestMeta(request);
    const rl = rateLimit(WEBHOOK_LIMITER, ipAddress ?? "origem-desconhecida");
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

    const norm = await normalizarPayload(raw);
    if (!norm.ok) {
      return NextResponse.json({ status: "ignored", reason: norm.motivo });
    }
    const { groupJid, messageId, isFromMe, pushName, senderJid, chat } = norm.msg;
    let { textContent, imageUrl } = norm.msg;

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
    // DM 1-1: chega quando lista de transmissao envia, ou contato manda direto.
    // No lado de quem recebe vem como @s.whatsapp.net (nao @broadcast).
    const isContact = groupJid?.endsWith("@s.whatsapp.net");
    if (!groupJid || (!isGroup && !isBroadcast && !isContact)) {
      return NextResponse.json({ status: "ignored", reason: "not_supported_chat" });
    }

    if (isFromMe) {
      return NextResponse.json({ status: "ignored", reason: "own_message" });
    }

    const group = await resolverGrupo({
      groupJid,
      chat,
      pushName,
      groupName: raw.message?.groupName ?? null,
      isGroup: !!isGroup,
      isBroadcast: !!isBroadcast,
      isContact: !!isContact,
    });

    if (!group || group.role !== "SOURCE" || !group.active) {
      return NextResponse.json({
        status: "ignored",
        reason: "group_not_monitored",
      });
    }

    const [existingMessage] = await db
      .select({ id: veiculos.id })
      .from(veiculos)
      .where(vivosE(veiculos, eq(veiculos.sourceMessageId, messageId)))
      .limit(1);

    if (existingMessage) {
      return NextResponse.json({
        status: "ignored",
        reason: "duplicate_message",
      });
    }

    // Foto e legenda podem chegar em mensagens separadas, em qualquer ordem.
    const pareado = parear({ groupJid, senderJid, messageId, textContent, imageUrl });
    if (pareado.tipo === "bufferado") {
      return NextResponse.json(pareado.resposta);
    }
    textContent = pareado.textContent;
    imageUrl = pareado.imageUrl;
    const extraPhotosFromBuffer = pareado.fotosExtras;

    // Se ainda nao tem imagem, descarta
    if (!imageUrl) {
      console.log("[Webhook] IGNORED: no_photo for", groupJid);
      return NextResponse.json({ status: "ignored", reason: "no_photo" });
    }

    // Foto sem legenda pode ser a segunda foto de um anuncio ja capturado.
    if (!textContent && imageUrl && senderJid) {
      const album = await anexarFotoExtra({
        groupId: group.groupId,
        senderJid,
        imageUrl,
      });
      if (album.anexou) {
        return NextResponse.json({
          status: "multi_photo_appended",
          vehicleId: album.vehicleId,
          totalPhotos: album.totalPhotos,
        });
      }
      if (album.motivo === "limite_atingido") {
        return NextResponse.json({ status: "ignored", reason: "multi_photo_limit" });
      }
      // Sem anuncio recente para anexar: descarta como antes.
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
      const [duplicate] = await db
        .select({ id: veiculos.id })
        .from(veiculos)
        .where(
          vivosE(
            veiculos,
            eq(veiculos.photoHash, photoHash),
            gte(veiculos.capturedAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
          )
        )
        .limit(1);
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
      features.push("PLACA VISIVEL");
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

    // Filtros de captura: globais (configuracoes) + os do proprio grupo.
    const filtro = await aplicarFiltros({
      model,
      brand: brand ?? null,
      year,
      km,
      price,
      state: state ?? null,
      transmission: transmission ?? null,
      fuel: fuel ?? null,
      features,
      photos,
      fipePrice: typeof vehicleData.fipePrice === "number" ? vehicleData.fipePrice : null,
      grupo: { region: group.region, filters: group.filters, name: group.name },
    });
    if (!filtro.passou) {
      return NextResponse.json(filtro.resposta);
    }
    const fipePrice = filtro.fipePrice;


    const vehicleHash = generateVehicleHash({ model, year, km, price });
    const identityHash = generateVehicleIdentityHash({ model, year, km });

    // Dedup de 30 DIAS por identidade (sem preco no hash) -- regra do cliente:
    // mesmo carro reposto = fica o mais barato, descarta os outros.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let [existingByIdentity] = await db
      .select()
      .from(veiculos)
      .where(
        vivosE(
          veiculos,
          eq(veiculos.identityHash, identityHash),
          gte(veiculos.capturedAt, thirtyDaysAgo)
        )
      )
      .orderBy(asc(veiculos.price)) // o mais barato existente (ja persistido)
      .limit(1);

    // Fallback FUZZY: se hash exato nao achou, tenta similaridade
    // (modelo normalizado parcial, year +/-1, km +/-20%)
    if (!existingByIdentity) {
      const fuzzy = await findFuzzyDuplicate({ model, year, km }, 30);
      if (fuzzy) {
        [existingByIdentity] = await db
          .select()
          .from(veiculos)
          .where(vivosE(veiculos, eq(veiculos.id, fuzzy.id)))
          .limit(1);
        if (existingByIdentity) {
          console.log(`[Webhook] DEDUP fuzzy match: ${existingByIdentity.id} (${existingByIdentity.model})`);
        }
      }
    }

    if (existingByIdentity) {
      // Mesmo carro nos ultimos 30 dias
      if (price < existingByIdentity.price && existingByIdentity.status === "PENDING") {
        // Novo preco e MENOR -- atualiza o registro existente
        await db
          .update(veiculos)
          .set({
            price,
            vehicleHash, // recalcula com novo preco
            fipePrice: fipePrice ?? existingByIdentity.fipePrice,
            rawDescription: textContent ?? existingByIdentity.rawDescription,
            sellerPhone: (vehicleData.sellerPhone as string) || existingByIdentity.sellerPhone,
            capturedAt: new Date(), // refresca a janela
            ...carimboDeEdicao(null),
          })
          .where(vivosE(veiculos, eq(veiculos.id, existingByIdentity.id)));
        console.log(`[Webhook] DEDUP: preco menor encontrado, atualizando ${existingByIdentity.id} (${existingByIdentity.price} -> ${price})`);
        return NextResponse.json({
          status: "updated_lower_price",
          existingId: existingByIdentity.id,
          oldPrice: existingByIdentity.price,
          newPrice: price,
        });
      }
      // Preco igual ou MAIOR (ou status nao-PENDING) -- descarta
      console.log(`[Webhook] DEDUP: mesmo carro nos ultimos 30d com preco menor/igual, descartando (existente=${existingByIdentity.price}, novo=${price})`);
      return NextResponse.json({
        status: "duplicate_30d",
        existingId: existingByIdentity.id,
        existingPrice: existingByIdentity.price,
        newPrice: price,
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

    const [vehicle] = await db
      .insert(veiculos)
      .values({
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
        identityHash,
        vehicleHash,
        photoHash,
        qualityScore,
        isVip,
        autoRejectedReason,
        status: autoRejectedReason ? "REJECTED" : "PENDING",
        rejectedAt: autoRejectedReason ? new Date() : null,
        rejectionReason: autoRejectedReason ? `Auto: ${autoRejectedReason}` : null,
      })
      .returning();

    // Anuncio formatado e analise de fotos rodam soltos: chamam IA e nao
    // precisam segurar a resposta do webhook.
    if (!autoRejectedReason && textContent && textContent.length >= 20) {
      gerarAnuncioEmBackground(vehicle.id, textContent, {
        model, brand, year, yearModel, km, price, fipePrice,
        transmission, fuel, features,
      });
    }
    if (photos.length > 1 && !autoRejectedReason) {
      analisarFotosEmBackground(vehicle.id, photos);
    }

    await registrarAuditoria({
      action: "VEHICLE_CAPTURED",
      entityType: "Vehicle",
      entityId: vehicle.id,
      vehicleId: vehicle.id,
      details: {
        source: group.name,
        groupJid,
        messageId,
        sender: pushName,
      },
      request,
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
