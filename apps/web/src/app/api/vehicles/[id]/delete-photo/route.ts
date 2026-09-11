import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, veiculos, carimboDeEdicao, travaDeColisao, vivosE } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * DELETE /api/vehicles/[id]/delete-photo?index=0
 * Remove uma foto do array de fotos do veiculo.
 *
 * Le e grava com trava de colisao: dois operadores apagando fotos do mesmo
 * veiculo ao mesmo tempo nao sobrescrevem um ao outro em silencio.
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

    const [vehicle] = await db
      .select({ photos: veiculos.photos, updatedAt: veiculos.updatedAt })
      .from(veiculos)
      .where(vivosE(veiculos, eq(veiculos.id, id)))
      .limit(1);
    if (!vehicle) {
      return NextResponse.json({ error: "Veiculo nao encontrado" }, { status: 404 });
    }

    let photos: string[] = [];
    try {
      photos = JSON.parse(vehicle.photos || "[]");
    } catch {
      photos = [];
    }

    if (index < 0 || index >= photos.length) {
      return NextResponse.json({ error: "Indice de foto invalido" }, { status: 400 });
    }

    photos.splice(index, 1);

    const [updated] = await db
      .update(veiculos)
      .set({ photos: JSON.stringify(photos), ...carimboDeEdicao(auth.user.id) })
      .where(travaDeColisao(veiculos, id, vehicle.updatedAt))
      .returning({ photos: veiculos.photos });

    if (!updated) {
      return NextResponse.json(
        { error: "Veiculo alterado por outro usuario. Recarregue a tela." },
        { status: 409 }
      );
    }

    let parsedPhotos: string[] = [];
    try {
      parsedPhotos = JSON.parse(updated.photos || "[]");
    } catch {
      /* */
    }
    return NextResponse.json({ photos: parsedPhotos, remaining: photos.length });
  } catch (error) {
    console.error("[Vehicles] Error deleting photo:", error);
    return NextResponse.json({ error: "Erro ao deletar foto" }, { status: 500 });
  }
}
