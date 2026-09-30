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
import { parear, fotosQueChegaramDepois } from "@/lib/webhook/parear";
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
import { lerCriteriosDoScore } from "@/lib/criterios-do-score";
import { isVipVehicle } from "@/lib/vip-detection";
import { hashPhoto } from "@/lib/photo-hash";
import { normalizarEstado } from "@/lib/estados";

const WEBHOOK_LIMITER = { name: "webhook", maxRequests: 30, windowSeconds: 60 };

// Simple in-memory lock to prevent concurrent processing of same message
const _processingLock = new Set<string>();


/**
 * Marca a entrega que a busca de canais faz em processo.
 *
 * Nao da pra forjar de fora: quem entrega assim chama a funcao, nao manda uma
 * requisicao -- nenhum cabecalho produz este simbolo.
 */
export const ENTREGA_INTERNA = Symbol("entrega-interna");

export async function POST(request: NextRequest, contexto?: unknown) {
  const interna = contexto === ENTREGA_INTERNA;
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
    //
    // A entrega interna fica FORA do teto. Ela nao tem IP, entao caia junto
    // com todo o resto no balde "origem-desconhecida": com 3 canais a 10
    // publicacoes cada, o giro batia nas 30 e o terceiro canal levava 429 --
    // e o marcador andava por cima, perdendo aquele anuncio pra sempre. Era
    // por isso que so um canal chegava (25/09/2026).
    if (!interna) {
      const { ipAddress } = extractRequestMeta(request);
      const rl = rateLimit(WEBHOOK_LIMITER, ipAddress ?? "origem-desconhecida");
      if (!rl.allowed) {
        return NextResponse.json(
          { error: "Rate limit exceeded" },
          { status: 429 }
        );
      }
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
    // A impressao digital da foto sai ANTES de guardar.
    //
    // Guardar troca a foto por `/api/media/<uuid>`, e o uuid e novo a cada
    // captura: o hash do endereco nunca casaria com o de antes e a dedup por
    // foto morria calada, fazendo todo repost do mesmo carro pagar IA de
    // novo. Aqui o hash ainda ve os bytes.
    const photoHash = imageUrl ? hashPhoto(imageUrl) : null;

    // `data:` tambem: a foto que ja chega pronta (canal decifrado, download da
    // UAZAPI) ia inteira pra coluna `photos` como base64 -- megabytes por
    // carro, em toda resposta da API. Guardada vira `/api/media/<id>`.
    if (imageUrl && (imageUrl.startsWith("http") || imageUrl.startsWith("data:"))) {
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
    // No lado de quem recebe vem como conversa (nao @broadcast). O WhatsApp
    // mudou o endereco dessa conversa para `@lid`; sem ele, mensagem de lista
    // era descartada como "conversa nao suportada".
    const isContact = groupJid?.endsWith("@s.whatsapp.net") || groupJid?.endsWith("@lid");
    if (!groupJid || (!isGroup && !isBroadcast && !isContact)) {
      return NextResponse.json({ status: "ignored", reason: "not_supported_chat" });
    }

    // Status/Stories do WhatsApp tambem moram em @broadcast. Chat novo entra
    // sozinho como fonte ATIVA (lib/webhook/grupo.ts), entao sem esta linha o
    // Status de qualquer contato viraria uma fonte chamada "Lista: status" e
    // a fila encheria de recado que nao e anuncio de carro.
    if (groupJid === "status@broadcast") {
      return NextResponse.json({ status: "ignored", reason: "status_do_whatsapp" });
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
      // Era o unico descarte da esteira sem nada no log: a mensagem sumia e
      // parecia que a captura nao tinha rodado. Lista de transmissao chega
      // pela conversa do vendedor, e e ela que precisa estar ativa.
      console.log(
        `[Webhook] IGNORED: group_not_monitored ${groupJid}`,
        group ? `(cadastrado como ${group.role}, ativo=${group.active}, nome="${group.name}")` : "(nao cadastrado)"
      );
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
      // A IA rodou (e custou) e disse que nao ha carro ali. Era o unico
      // descarte sem log: ficava impossivel saber se o anuncio era mesmo um
      // recado do canal ou se a extracao errou.
      console.log(
        "[Webhook] IGNORED: no_vehicle_data for",
        (textContent ?? "(sem texto)").substring(0, 120),
        imageUrl ? "(com foto)" : "(sem foto)"
      );
      return NextResponse.json({
        status: "ignored",
        reason: "no_vehicle_data",
        amostra: (textContent ?? "").substring(0, 120),
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
    const state = normalizarEstado(vehicleData.state as string | null);
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

    // A acao da dedup ficou la embaixo, depois de `dados`: o registro que
    // sobrevive tem que ser UM anuncio inteiro, nao a mistura de dois.

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
    const { score: qualityScore } = calculateQualityScore(
      { km, year, price, fipePrice, rawDescription: textContent },
      await lerCriteriosDoScore()
    );

    // VIP detection
    const isVip = await isVipVehicle(model, brand);

    const dados = {
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
    };

    // Dedup de 30 dias: o mais barato fica. O registro que sobra passa a ser
    // O ANUNCIO NOVO INTEIRO -- foto, grupo de origem, texto original e o
    // anuncio refeito. Antes so preco e rawDescription eram trocados, e o
    // card ficava com a foto e a fonte de um carro e o "Ver original" de
    // outro (relatado pelo cliente em 20/09/2026, num Fastback).
    if (existingByIdentity) {
      const trocaVale =
        !autoRejectedReason && price < existingByIdentity.price && existingByIdentity.status === "PENDING";
      if (trocaVale) {
        const [atualizado] = await db
          .update(veiculos)
          .set({
            ...dados,
            capturedAt: new Date(), // refresca a janela
            // O anuncio refeito era do texto que perdeu -- inclusive o que o
            // operador tinha editado. Zera pra sair de novo do texto que ficou.
            formattedAd: null,
            adEditedAt: null,
            ...carimboDeEdicao(null),
          })
          .where(vivosE(veiculos, eq(veiculos.id, existingByIdentity.id)))
          .returning();
        console.log(`[Webhook] DEDUP: preco menor encontrado, trocando o anuncio ${existingByIdentity.id} (${existingByIdentity.price} -> ${price})`);
        if (atualizado && textContent && textContent.length >= 20) {
          gerarAnuncioEmBackground(atualizado.id, textContent, {
            model, brand, year, yearModel, km, price, fipePrice,
            transmission, fuel, features,
          });
        }
        const fotosDoCarro = atualizado ? await juntarAoAlbum(groupJid, senderJid, atualizado.id, photos) : photos;
        if (atualizado && fotosDoCarro.length > 1) analisarFotosEmBackground(atualizado.id, fotosDoCarro);
        return NextResponse.json({
          status: "updated_lower_price",
          existingId: existingByIdentity.id,
          oldPrice: existingByIdentity.price,
          newPrice: price,
        });
      }
      // Preco igual ou MAIOR (ou ja aprovado/rejeitado) -- descarta o novo
      console.log(`[Webhook] DEDUP: mesmo carro nos ultimos 30d com preco menor/igual, descartando (existente=${existingByIdentity.price}, novo=${price})`);
      return NextResponse.json({
        status: "duplicate_30d",
        existingId: existingByIdentity.id,
        existingPrice: existingByIdentity.price,
        newPrice: price,
      });
    }

    // `source_message_id` e unico na tabela inteira, excluidos inclusive. Sem
    // isto, um anuncio que ja passou por aqui e foi apagado (o "zerar", por
    // exemplo) derrubava a captura com erro de trava ao ser publicado de novo.
    const [vehicle] = await db
      .insert(veiculos)
      .values(dados)
      .onConflictDoUpdate({
        target: veiculos.sourceMessageId,
        set: { ...dados, isDeleted: false, deletedAt: null, ...carimboDeEdicao(null) },
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
    const fotosDoCarro = await juntarAoAlbum(groupJid, senderJid, vehicle.id, photos);
    if (fotosDoCarro.length > 1 && !autoRejectedReason) {
      analisarFotosEmBackground(vehicle.id, fotosDoCarro);
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

/**
 * O vendedor que manda o texto primeiro continua mandando fotos enquanto o
 * carro e gravado. Elas esperaram no pareamento e entram agora, neste carro.
 */
async function juntarAoAlbum(
  groupJid: string,
  senderJid: string | null,
  veiculoId: string,
  photos: string[],
): Promise<string[]> {
  const tardias = fotosQueChegaramDepois(groupJid, senderJid, veiculoId);
  if (!tardias.length) return photos;
  const todas = [...photos, ...tardias].filter((p, i, arr) => arr.indexOf(p) === i).slice(0, 12);
  await db.update(veiculos).set({ photos: JSON.stringify(todas) }).where(eq(veiculos.id, veiculoId));
  console.log(`[Webhook] Multi-photo: ${tardias.length} foto(s) que chegaram durante a gravacao -> ${veiculoId}`);
  return todas;
}
