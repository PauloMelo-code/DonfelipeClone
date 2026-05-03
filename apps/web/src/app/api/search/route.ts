import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const q = (request.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ vehicles: [], groups: [] });

  try {
    const [vehicles, groups] = await Promise.all([
      prisma.vehicle.findMany({
        where: {
          OR: [
            { model: { contains: q, mode: "insensitive" } },
            { brand: { contains: q, mode: "insensitive" } },
            { plate: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, model: true, brand: true, year: true, km: true, price: true, status: true },
        take: 10,
        orderBy: { capturedAt: "desc" },
      }),
      prisma.whatsAppGroup.findMany({
        where: { name: { contains: q, mode: "insensitive" } },
        select: { id: true, name: true, groupId: true, role: true },
        take: 5,
      }),
    ]);

    return NextResponse.json({ vehicles, groups });
  } catch (error) {
    console.error("[search] Error:", error);
    return NextResponse.json({ vehicles: [], groups: [] }, { status: 500 });
  }
}
