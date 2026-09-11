import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db, veiculos, vivosE } from "@/lib/db";
import { publishVehicle } from "@/lib/publisher";
import { requireAuth } from "@/lib/auth";

interface BatchResult {
  vehicleId: string;
  success: boolean;
  error?: string;
  groupsPublished?: number;
  groupsFailed?: number;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const body = await request.json();
    const { vehicleIds } = body;

    if (!Array.isArray(vehicleIds) || vehicleIds.length === 0) {
      return NextResponse.json(
        { error: "vehicleIds deve ser um array nao vazio" },
        { status: 400 }
      );
    }

    if (vehicleIds.length > 50) {
      return NextResponse.json(
        { error: "Maximo de 50 veiculos por lote" },
        { status: 400 }
      );
    }

    // O include de postHistory foi removido: nada no handler usava a lista,
    // e ela trazia todo o historico de publicacao de cada veiculo do lote.
    const vehicles = await db
      .select()
      .from(veiculos)
      .where(vivosE(veiculos, inArray(veiculos.id, vehicleIds), eq(veiculos.status, "APPROVED")));

    const approvedIds = new Set(vehicles.map((v) => v.id));
    const results: BatchResult[] = [];

    for (const requestedId of vehicleIds) {
      if (!approvedIds.has(requestedId)) {
        results.push({
          vehicleId: requestedId,
          success: false,
          error: "Veiculo nao encontrado ou nao esta aprovado",
        });
        continue;
      }

      const vehicle = vehicles.find((v) => v.id === requestedId)!;

      if (!vehicle.formattedAd) {
        results.push({
          vehicleId: requestedId,
          success: false,
          error: "Veiculo nao possui anuncio formatado",
        });
        continue;
      }

      try {
        const publishResults = await publishVehicle(requestedId);
        const groupsPublished = publishResults.filter((r) => r.success).length;
        const groupsFailed = publishResults.filter((r) => !r.success).length;

        results.push({
          vehicleId: requestedId,
          success: groupsPublished > 0,
          groupsPublished,
          groupsFailed,
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Erro desconhecido";

        results.push({
          vehicleId: requestedId,
          success: false,
          error: errorMessage,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      message: `Publicacao em lote concluida: ${successCount} sucesso, ${failureCount} falhas`,
      summary: {
        total: vehicleIds.length,
        success: successCount,
        failure: failureCount,
      },
      results,
    });
  } catch (error) {
    console.error("[Publish] Error batch publishing:", error);
    return NextResponse.json(
      { error: "Erro ao publicar veiculos em lote" },
      { status: 500 }
    );
  }
}
