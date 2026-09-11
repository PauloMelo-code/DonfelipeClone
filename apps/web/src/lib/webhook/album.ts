import { eq, or, gte, ilike, desc } from "drizzle-orm";
import { db, veiculos, carimboDeEdicao, vivosE } from "@/lib/db";
import { comoTermoLike } from "@/lib/db/like";

// ---------------------------------------------------------------------------
// Album: foto extra que chega DEPOIS do anuncio ja ter virado veiculo.
//
// O vendedor manda a foto principal com a legenda e, em seguida, as fotos da
// interna sem texto nenhum. Sem isto, cada foto extra caia em "image_no_caption"
// e o anuncio ficava com uma foto so.
//
// O casamento primario e por `sourceSenderJid`, que e o JID de quem postou e
// nao se repete entre pessoas. `sellerPhone` e fallback para anuncios antigos,
// gravados antes desse campo existir.
// ---------------------------------------------------------------------------

/** Teto de fotos por anuncio. Acima disso a extra e descartada. */
const MAX_FOTOS = 12;

export type ResultadoAlbum =
  | { anexou: true; vehicleId: string; totalPhotos: number }
  | { anexou: false; motivo: "sem_alvo" | "limite_atingido" };

export async function anexarFotoExtra(e: {
  groupId: string;
  senderJid: string;
  imageUrl: string;
}): Promise<ResultadoAlbum> {
  const cincoMinAtras = new Date(Date.now() - 5 * 60_000);
  const digitos = e.senderJid.replace(/\D/g, "");

  let [alvo] = await db
    .select({ id: veiculos.id, photos: veiculos.photos })
    .from(veiculos)
    .where(
      vivosE(
        veiculos,
        eq(veiculos.sourceGroupId, e.groupId),
        gte(veiculos.capturedAt, cincoMinAtras),
        or(
          eq(veiculos.sourceSenderJid, e.senderJid),
          eq(veiculos.sellerPhone, e.senderJid),
          eq(veiculos.sellerPhone, digitos),
          ilike(veiculos.sellerPhone, comoTermoLike(digitos))
        )
      )
    )
    .orderBy(desc(veiculos.capturedAt))
    .limit(1);

  // Nada casou pelo remetente. Se existe UM unico anuncio recentissimo no
  // grupo, e quase certo que a foto e dele (vendedor mandando em sequencia).
  if (!alvo) {
    const noventaSegAtras = new Date(Date.now() - 90_000);
    const recentes = await db
      .select({ id: veiculos.id, photos: veiculos.photos })
      .from(veiculos)
      .where(
        vivosE(
          veiculos,
          eq(veiculos.sourceGroupId, e.groupId),
          gte(veiculos.capturedAt, noventaSegAtras)
        )
      )
      .orderBy(desc(veiculos.capturedAt))
      .limit(2);
    if (recentes.length === 1) {
      alvo = recentes[0];
      console.log("[Webhook] Multi-photo: fallback -- unico anuncio recente no grupo");
    }
  }

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

  if (!fotos.includes(e.imageUrl)) {
    fotos.push(e.imageUrl);
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
