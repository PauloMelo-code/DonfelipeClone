import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

/**
 * DELETE /api/vehicles/[id]/delete-photo?index=0
 * Removes a specific photo from a vehicle's photos array.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;
    const index = parseInt(request.nextUrl.searchParams.get("index") || "0", 10);

    const vehicle = await prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) {
      return NextResponse.json({ error: "Veiculo nao encontrado" }, { status: 404 });
    }

    const photos: string[] = JSON.parse(vehicle.photos || "[]");

    if (index < 0 || index >= photos.length) {
      return NextResponse.json({ error: "Indice de foto invalido" }, { status: 400 });
    }

    photos.splice(index, 1);

    const updated = await prisma.vehicle.update({
      where: { id },
      data: { photos: JSON.stringify(photos) },
    });

    return NextResponse.json({
      photos: JSON.parse(updated.photos),
      remaining: photos.length,
    });
  } catch (error) {
    console.error("[Vehicles] Error deleting photo:", error);
    return NextResponse.json({ error: "Erro ao deletar foto" }, { status: 500 });
  }
}
