import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { countBusinessDays } from "@/lib/business-days";

// ---------------------------------------------------------------------------
// Vehicle Hash Generation
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic MD5 hash from a vehicle's core identity fields.
 *
 * The hash is built from a normalised pipe-delimited string:
 *   `MODEL|YEAR|KM|PRICE`
 *
 * - Model is uppercased and trimmed.
 * - All values are coerced to their string representations.
 *
 * @returns A 32-character hex MD5 digest.
 */
export function generateVehicleHash(vehicle: {
  model: string;
  year: number;
  km: number;
  price: number;
}): string {
  const normalised = [
    vehicle.model.trim().toUpperCase(),
    String(vehicle.year),
    String(vehicle.km),
    String(vehicle.price),
  ].join("|");

  return createHash("md5").update(normalised).digest("hex");
}

// ---------------------------------------------------------------------------
// Deduplication Check
// ---------------------------------------------------------------------------

/**
 * Determine whether a vehicle (identified by its hash) can be posted to
 * a specific target group.
 *
 * Rules:
 *  1. If no successful post exists for this hash+group combination, allow.
 *  2. If the most recent successful post was >= 2 business days ago, allow.
 *  3. Otherwise deny (the vehicle must skip at least 1 full business day).
 *
 * @param vehicleHash   - MD5 hash of the vehicle identity.
 * @param targetGroupId - The WhatsApp group ID of the target group.
 * @returns true if posting is allowed; false otherwise.
 */
export async function canPostVehicle(
  vehicleHash: string,
  targetGroupId: string
): Promise<boolean> {
  const lastPost = await prisma.postHistory.findFirst({
    where: {
      vehicleHash,
      targetGroupId,
      success: true,
    },
    orderBy: { postedAt: "desc" },
  });

  // No previous successful post -- allow
  if (!lastPost) {
    return true;
  }

  const now = new Date();
  const businessDaysSinceLast = countBusinessDays(lastPost.postedAt, now);

  // Must have passed at least 2 business days (i.e., skip >= 1 full business day)
  return businessDaysSinceLast >= 2;
}

// ---------------------------------------------------------------------------
// Record a Post
// ---------------------------------------------------------------------------

/**
 * Persist a post attempt (successful or not) in the PostHistory table.
 *
 * @param vehicleId     - The database ID of the Vehicle record.
 * @param vehicleHash   - MD5 hash of the vehicle identity.
 * @param targetGroupId - The WhatsApp group ID of the target group.
 * @param messageId     - The WhatsApp message ID returned by the API (optional).
 * @param success       - Whether the post was successful (defaults to true).
 * @param errorMessage  - Error details if the post failed (optional).
 */
export async function recordPost(
  vehicleId: string,
  vehicleHash: string,
  targetGroupId: string,
  messageId?: string,
  success: boolean = true,
  errorMessage?: string
): Promise<void> {
  await prisma.postHistory.create({
    data: {
      vehicleId,
      vehicleHash,
      targetGroupId,
      messageId: messageId ?? null,
      success,
      errorMessage: errorMessage ?? null,
    },
  });
}
