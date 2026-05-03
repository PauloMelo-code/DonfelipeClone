import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  const v = await prisma.vehicle.findUnique({ where: { id } });
  if (!v) return NextResponse.json({ error: "Veiculo nao encontrado" }, { status: 404 });

  const modelKey = v.model.toLowerCase().split(" ").slice(0, 2).join(" ");
  const similar = await prisma.vehicle.findMany({
    where: {
      id: { not: id },
      year: { gte: v.year - 1, lte: v.year + 1 },
      km: { gte: v.km * 0.7, lte: v.km * 1.3 },
      capturedAt: { gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
      // Same photo OR same model name prefix
      OR: [
        v.photoHash ? { photoHash: v.photoHash } : { id: "_never_" },
        { model: { contains: modelKey, mode: "insensitive" } },
      ],
    },
    select: {
      id: true, model: true, year: true, km: true, price: true,
      photoHash: true, status: true, capturedAt: true,
      sourceGroup: { select: { name: true } },
    },
    take: 10,
  });

  return NextResponse.json({ similar });
}
