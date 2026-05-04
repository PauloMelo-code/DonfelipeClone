import { prisma } from "@/lib/prisma";
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
  const row = await prisma.setting.findUnique({ where: { key } });
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
  const s = await prisma.setting.findUnique({ where: { key: "publishing_paused" } });
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
  options?: { targetGroupIds?: string[]; formattedAd?: string; sellingPrice?: number; userId?: string }
): Promise<PublishResult[]> {
  // --- Kill switch: block if global publishing is paused ---
  if (await isPublishingPaused()) {
    throw new Error("Disparo global pausado");
  }

  // --- Load the vehicle ---
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
  });

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
  const delayMinSeconds = await getSettingNumber("delay_min_seconds", 3);
  const delayMaxSeconds = await getSettingNumber("delay_max_seconds", 8);

  // --- Format the ad ---
  const features: string[] = (() => {
    try {
      return JSON.parse(vehicle.features);
    } catch {
      return [];
    }
  })();

  const photos: string[] = (() => {
    try {
      return JSON.parse(vehicle.photos);
    } catch {
      return [];
    }
  })();

  // Auto-extract FIPE if missing
  let fipePrice = vehicle.fipePrice;
  if (fipePrice == null && vehicle.rawDescription) {
    const m = vehicle.rawDescription.match(/fipe\s*:?\s*r?\$?\s*([\d.,]+)\s*(mil)?/i);
    if (m) {
      let raw = m[1];
      if (m[2]?.toLowerCase() === "mil") {
        fipePrice = parseFloat(raw.replace(",", ".")) * 1000;
      } else {
        raw = raw.replace(/\./g, "").replace(",", ".");
        const n = parseFloat(raw);
        if (!isNaN(n) && n >= 1000) fipePrice = n;
      }
      if (fipePrice != null) {
        await prisma.vehicle.update({ where: { id: vehicle.id }, data: { fipePrice } });
      }
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
  const targetGroups = await prisma.whatsAppGroup.findMany({
    where: {
      role: "TARGET",
      active: true,
      ...(options?.targetGroupIds?.length
        ? { groupId: { in: options.targetGroupIds } }
        : {}),
    },
  });

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
          result.skippedReason
        );
        results.push(result);
        continue;
      }

      // 2. Send "composing" presence
      await getSendClient().sendPresence({
        number: group.groupId,
        presence: "composing",
      });

      // 3. Random delay
      await randomDelay(
        delayMinSeconds * 1000,
        delayMaxSeconds * 1000
      );

      // 4. Send message
      let messageId: string | undefined;

      if (photos.length > 0) {
        // Resolve photo: /api/media/[id] → base64 data URI for UAZAPI (external service)
        let photoFile = photos[0];
        if (photoFile.startsWith("/api/media/")) {
          const mediaId = photoFile.replace("/api/media/", "");
          const media = await prisma.mediaFile.findUnique({ where: { id: mediaId } });
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
        true
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
        errorMsg
      );
    }

    results.push(result);
  }

  // --- Post-publish updates ---
  const anySuccess = results.some((r) => r.success);

  if (anySuccess) {
    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        status: "PUBLISHED",
        formattedAd: adText,
        sellingPrice: options?.sellingPrice ??
          vehicle.price * (1 + profitMarginPercent / 100),
        publishedAt: new Date(),
      },
    });
  }

  // --- Audit log ---
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter(
    (r) => !r.success && !r.skippedReason
  ).length;
  const skipCount = results.filter((r) => !!r.skippedReason).length;

  await prisma.auditLog.create({
    data: {
      action: "VEHICLE_PUBLISH",
      entityType: "Vehicle",
      entityId: vehicleId,
      vehicleId,
      userId: options?.userId,
      details: JSON.stringify({
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
      }),
    },
  });

  return results;
}
