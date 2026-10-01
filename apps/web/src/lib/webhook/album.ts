import { eq } from "drizzle-orm";
import { db, veiculos, carimboDeEdicao, vivosE } from "@/lib/db";

// ---------------------------------------------------------------------------
// Album: foto extra que chega DEPOIS do anuncio ja ter virado veiculo.
//
// O vendedor manda a foto principal com a legenda e, em seguida, as fotos da
// interna sem texto nenhum. Sem isto, cada foto extra caia em "image_no_caption"
// e o anuncio ficava com uma foto so.
//
// QUAL veiculo quem diz e o pareamento (o album aberto daquele vendedor), nao
// uma busca. Ate 01/10/2026 a foto procurava o carro do mesmo vendedor nos
// ultimos 5 min e, sem achar, ia pro unico carro recente do GRUPO -- de
// qualquer vendedor. Um Corolla recebeu a foto de uma SW4.
// ---------------------------------------------------------------------------

/** Teto de fotos por anuncio. Acima disso a extra e descartada. */
const MAX_FOTOS = 12;

export type ResultadoAlbum =
  | { anexou: true; vehicleId: string; totalPhotos: number }
  | { anexou: false; motivo: "sem_alvo" | "limite_atingido" };

export async function anexarFotoExtra(vehicleId: string, imageUrl: string): Promise<ResultadoAlbum> {
  const [alvo] = await db
    .select({ id: veiculos.id, photos: veiculos.photos })
    .from(veiculos)
    .where(vivosE(veiculos, eq(veiculos.id, vehicleId)))
    .limit(1);
  if (!alvo) return { anexou: false, motivo: "sem_alvo" };

  let fotos: string[] = [];
  try {
    const lido = JSON.parse(alvo.photos);
    if (Array.isArray(lido)) fotos = lido.filter((p) => typeof p === "string");
  } catch {
    /* ignore */
  }

  if (fotos.length >= MAX_FOTOS) {
    console.log(
      `[Webhook] Multi-photo: vehicle ${alvo.id} ja tem ${MAX_FOTOS} fotos, ignorando extra`
    );
    return { anexou: false, motivo: "limite_atingido" };
  }

  if (!fotos.includes(imageUrl)) {
    fotos.push(imageUrl);
    await db
      .update(veiculos)
      .set({ photos: JSON.stringify(fotos), ...carimboDeEdicao(null) })
      .where(vivosE(veiculos, eq(veiculos.id, alvo.id)));
    console.log(
      `[Webhook] Multi-photo: foto anexada ao vehicle ${alvo.id} (total: ${fotos.length})`
    );
  }

  return { anexou: true, vehicleId: alvo.id, totalPhotos: fotos.length };
}
