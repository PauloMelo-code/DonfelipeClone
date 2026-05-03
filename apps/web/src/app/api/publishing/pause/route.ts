import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

const PAUSE_KEY = "publishing_paused";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;
  const setting = await prisma.setting.findUnique({ where: { key: PAUSE_KEY } });
  return NextResponse.json({ paused: setting?.value === "true" });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  const body = await request.json().catch(() => ({}));
  const paused = body?.paused === true;

  await prisma.setting.upsert({
    where: { key: PAUSE_KEY },
    update: { value: paused ? "true" : "false" },
    create: { key: PAUSE_KEY, value: paused ? "true" : "false" },
  });

  await prisma.auditLog.create({
    data: {
      action: paused ? "PUBLISHING_PAUSED" : "PUBLISHING_RESUMED",
      entityType: "Setting",
      userId: auth.user.id,
    },
  });

  return NextResponse.json({ paused });
}
