import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  veiculos,
  gruposWhatsapp,
  configuracoes,
  arquivosMidia,
  carimboDeEdicao,
  travaDeColisao,
  vivos,
  vivosE,
} from "@/lib/db";
import { registrarAuditoria } from "@/lib/audit";
import { extrairFipeDoTexto } from "@/lib/actions/veiculos";
import { repararFoto } from "@/lib/media-storage";
import { getSendClient } from "@/lib/uazapi";
import { canPostVehicle, recordPost } from "@/lib/deduplication";
import { formatVehicleAd } from "@/lib/vehicle-formatter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PublishResult {
  targetGroupId: string;
  targetGroupName: string;
  success: boolean;
  messageId?: string;
  skippedReason?: string;
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Retrieve a numeric setting from the Settings table with a default fallback.
 */
async function getSettingNumber(
  key: string,
  defaultValue: number
): Promise<number> {
  const [row] = await db
    .select({ value: configuracoes.value })
    .from(configuracoes)
    .where(and(eq(configuracoes.key, key), vivos(configuracoes)))
    .limit(1);
  if (!row) return defaultValue;
  const parsed = Number(row.value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Sleep for a random duration between min and max milliseconds.
 */
function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if global publishing is paused (kill switch).
 */
async function isPublishingPaused(): Promise<boolean> {
  const [s] = await db
    .select({ value: configuracoes.value })
    .from(configuracoes)
    .where(and(eq(configuracoes.key, "publishing_paused"), vivos(configuracoes)))
    .limit(1);
  return s?.value === "true";
}

// ---------------------------------------------------------------------------
// Publishing Engine
// ---------------------------------------------------------------------------

/**
 * Publish a single vehicle to all active TARGET groups.
 *
 * Flow per group:
 *  1. Check deduplication (canPostVehicle).
 *  2. Send "composing" presence indicator.
 *  3. Wait a random delay (configured in settings).
 *  4. Send media (if photos exist) or text message with the formatted ad.
 *  5. Record the post result in PostHistory.
 *
 * After all groups are processed:
 *  - If at least one post succeeded, update the vehicle status to PUBLISHED.
 *  - Create an audit log entry.
 *
 * @param vehicleId - The database ID of the Vehicle to publish.
 * @returns An array of PublishResult, one per target group.
 */
export async function publishVehicle(
  vehicleId: string,
  options?: {
    targetGroupIds?: string[];
    formattedAd?: string;
    sellingPrice?: number;
    /** Fotos editadas (override da DB). Use para garantir que o frontend
     * envie as imagens recortadas/borradas em vez das originais quando o
     * PUT de salvar nao terminou antes do POST de publicar. */
    photos?: string[];
    userId?: string;
    quickPublish?: boolean;
  }
): Promise<PublishResult[]> {
  // --- Kill switch: block if global publishing is paused ---
  if (await isPublishingPaused()) {
    throw new Error("Disparo global pausado");
  }

  // --- Load the vehicle ---
  const [vehicle] = await db
    .select()
    .from(veiculos)
    .where(vivosE(veiculos, eq(veiculos.id, vehicleId)))
    .limit(1);

  if (!vehicle) {
    throw new Error(`Vehicle not found: ${vehicleId}`);
  }

  if (vehicle.status !== "APPROVED") {
    throw new Error(
      `Vehicle ${vehicleId} is not APPROVED (current status: ${vehicle.status})`
    );
  }

  // --- Load settings ---
  const profitMarginPercent = await getSettingNumber(
    "profit_margin_percent",
    10
  );
  // Quick publish (admin clicked single button): minimal delay (0.3-1s).
  // Batch publish: configurable anti-ban delay (default 1-3s).
  const delayMinSeconds = options?.quickPublish
    ? 0.3
    : await getSettingNumber("delay_min_seconds", 1);
  const delayMaxSeconds = options?.quickPublish
    ? 1
    : await getSettingNumber("delay_max_seconds", 3);
  const skipComposing = options?.quickPublish === true;

  // --- Format the ad ---
  const features: string[] = (() => {
    try {
      return JSON.parse(vehicle.features);
    } catch {
      return [];
    }
  })();

  // Prioridade: fotos passadas explicitamente (origem: modal de publish do
  // frontend, com edicoes ja aplicadas). Se nao vierem, usa do DB.
  const photos: string[] = options?.photos && options.photos.length > 0
    ? options.photos
    : (() => {
    try {
      return JSON.parse(vehicle.photos);
    } catch {
      return [] as string[];
    }
  })();

  // Diagnostic logging: confirma o que chegou (tira duvida sobre race condition)
  if (photos.length > 0) {
    const first = photos[0];
    const kind = first?.startsWith("data:")
      ? "data-uri-edited"
      : first?.startsWith("/api/media/")
        ? "db-media-id"
        : first?.startsWith("http")
          ? "external-url"
          : "unknown";
    console.log(
      `[publisher] vehicle=${vehicleId} source=${options?.photos?.length ? "OPTION" : "DB"} kind=${kind} count=${photos.length} firstSize=${first?.length ?? 0}`
    );
  }

  // FIPE ausente: le do texto do anuncio. Implementacao unica em
  // lib/actions/veiculos -- havia quatro copias disto no projeto.
  let fipePrice = vehicle.fipePrice;
  if (fipePrice == null && vehicle.rawDescription) {
    fipePrice = extrairFipeDoTexto(vehicle.rawDescription);
    if (fipePrice != null) {
      await db
        .update(veiculos)
        .set({ fipePrice, ...carimboDeEdicao(options?.userId ?? null) })
        .where(vivosE(veiculos, eq(veiculos.id, vehicle.id)));
    }
  }

  const adText = options?.formattedAd || formatVehicleAd(
    {
      model: vehicle.model,
      brand: vehicle.brand,
      year: vehicle.year,
      yearModel: vehicle.yearModel,
      km: vehicle.km,
      price: vehicle.price,
      fipePrice,
      transmission: vehicle.transmission,
      fuel: vehicle.fuel,
      features,
      rawDescription: vehicle.rawDescription,
      location: vehicle.location,
      state: vehicle.state,
    },
    { profitMarginPercent }
  );

  // --- Load target groups (optionally filtered) ---
  const targetGroups = await db
    .select()
    .from(gruposWhatsapp)
    .where(
      vivosE(
        gruposWhatsapp,
        eq(gruposWhatsapp.role, "TARGET"),
        eq(gruposWhatsapp.active, true),
        options?.targetGroupIds?.length
          ? inArray(gruposWhatsapp.groupId, options.targetGroupIds)
          : undefined
      )
    );

  if (targetGroups.length === 0) {
    throw new Error("No active TARGET groups configured");
  }

  // --- Publish to each group ---
  const results: PublishResult[] = [];

  for (const group of targetGroups) {
    // Kill switch: re-check before each group
    if (await isPublishingPaused()) {
      console.warn("[publisher] Pausa global detectada, abortando batch");
      break;
    }

    const result: PublishResult = {
      targetGroupId: group.groupId,
      targetGroupName: group.name,
      success: false,
    };

    try {
      // 1. Deduplication check
      const allowed = await canPostVehicle(
        vehicle.vehicleHash,
        group.groupId
      );

      if (!allowed) {
        result.skippedReason = "Deduplication: must skip at least 1 business day";
        await recordPost(
          vehicle.id,
          vehicle.vehicleHash,
          group.groupId,
          undefined,
          false,
          result.skippedReason,
          options?.userId
        );
        results.push(result);
        continue;
      }

      // 2. Send "composing" presence (skipped in quick publish for speed)
      // Run in parallel with delay so it doesn't add to total time
      const presencePromise = skipComposing
        ? Promise.resolve()
        : getSendClient()
            .sendPresence({ number: group.groupId, presence: "composing" })
            .catch(() => {}); // presence failure shouldn't block sending

      // 3. Random delay (in parallel with presence)
      await Promise.all([
        presencePromise,
        randomDelay(delayMinSeconds * 1000, delayMaxSeconds * 1000),
      ]);

      // 4. Send message
      let messageId: string | undefined;

      if (photos.length > 0) {
        // Resolve photo: /api/media/[id] → base64 data URI for UAZAPI (external service)
        //
        // Foto de canal antigo ficou como URL crua do CDN do WhatsApp: ia
        // assim pra UAZAPI e derrubava o envio. Baixa antes; se nao der, vai
        // como estava -- publicar sem foto e melhor que nao publicar.
        let photoFile = photos[0];
        if (photoFile.startsWith("http")) {
          const local = await repararFoto(photoFile).catch(() => photoFile);
          if (local !== photoFile) console.log(`[publisher] foto externa baixada antes do envio: ${local}`);
          photoFile = local;
        }
        if (photoFile.startsWith("/api/media/")) {
          const mediaId = photoFile.replace("/api/media/", "");
          const [media] = await db
            .select({ mimeType: arquivosMidia.mimeType, data: arquivosMidia.data })
            .from(arquivosMidia)
            .where(vivosE(arquivosMidia, eq(arquivosMidia.id, mediaId)))
            .limit(1);
          if (media) {
            const mimeType = media.mimeType === "application/octet-stream" ? "image/jpeg" : media.mimeType;
            photoFile = `data:${mimeType};base64,${media.data}`;
          }
        }

        // Send first photo with the ad text as caption
        const sendResult = await getSendClient().sendMedia({
          number: group.groupId,
          type: "image",
          file: photoFile,
          text: adText,
        });
        messageId = sendResult.key?.id;
      } else {
        // No photos -- send text only
        const sendResult = await getSendClient().sendText({
          number: group.groupId,
          text: adText,
        });
        messageId = sendResult.key?.id;
      }

      result.success = true;
      result.messageId = messageId;

      // 5. Record successful post
      await recordPost(
        vehicle.id,
        vehicle.vehicleHash,
        group.groupId,
        messageId,
        true,
        undefined,
        options?.userId
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      result.errorMessage = errorMsg;

      // Record failed post
      await recordPost(
        vehicle.id,
        vehicle.vehicleHash,
        group.groupId,
        undefined,
        false,
        errorMsg,
        options?.userId
      );
    }

    results.push(result);
  }

  // --- Post-publish updates ---
  const anySuccess = results.some((r) => r.success);

  if (anySuccess) {
    // Sem carimbo de colisao aqui de proposito: a publicacao leva minutos
    // (delay anti-ban por grupo) e esta mesma funcao ja pode ter gravado
    // fipePrice no meio do caminho. Comparar com o updatedAt lido no inicio
    // reprovaria a propria escrita. A trava mantem id + vivo.
    await db
      .update(veiculos)
      .set({
        status: "PUBLISHED",
        formattedAd: adText,
        sellingPrice:
          options?.sellingPrice ?? vehicle.price * (1 + profitMarginPercent / 100),
        publishedAt: new Date(),
        ...carimboDeEdicao(options?.userId ?? null),
      })
      .where(travaDeColisao(veiculos, vehicleId));
  }

  // --- Audit log ---
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter(
    (r) => !r.success && !r.skippedReason
  ).length;
  const skipCount = results.filter((r) => !!r.skippedReason).length;

  await registrarAuditoria({
    action: "VEHICLE_PUBLISH",
    entityType: "Vehicle",
    entityId: vehicleId,
    vehicleId,
    userId: options?.userId ?? null,
    details: {
      totalGroups: targetGroups.length,
      success: successCount,
      failed: failCount,
      skipped: skipCount,
      results: results.map((r) => ({
        group: r.targetGroupName,
        groupId: r.targetGroupId,
        success: r.success,
        skippedReason: r.skippedReason ?? null,
        errorMessage: r.errorMessage ?? null,
      })),
    },
  });

  return results;
}
