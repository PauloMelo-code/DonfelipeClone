import { eq, isNull } from "drizzle-orm";
import { db, veiculos, carimboDeEdicao, vivosE } from "@/lib/db";
import { extrairFipeDoTexto, precificar } from "@/lib/actions/veiculos";
import { cleanAdDescription } from "@/lib/ad-cleaner";
import { formatVehicleAd } from "@/lib/vehicle-formatter";
import { reorderPhotosByBest } from "@/lib/photo-picker";

// ---------------------------------------------------------------------------
// Trabalho que roda DEPOIS que o veiculo ja foi gravado.
//
// Os dois chamam IA e demoram; nenhum precisa segurar a resposta do webhook.
// Sao disparados soltos e falham em silencio no log -- se o anuncio nao ficar
// pronto, o operador clica em "Regerar com IA" na tela.
//
// ponytail: promise solta, sem fila. Reinicio no meio perde o trabalho e nao
// ha retentativa. Migrar para a fila (BullMQ no Redis que ja sobe no compose)
// quando a perda comecar a incomodar.
// ---------------------------------------------------------------------------

export interface DadosDoAnuncio {
  model: string;
  brand: string | null;
  year: number;
  yearModel: number | null;
  km: number;
  price: number;
  fipePrice: number | null;
  transmission: string | null;
  fuel: string | null;
  features: string[];
}

/**
 * Gera o anuncio formatado ja limpo (sem cabecalho de loja, contato, frase
 * promocional) no momento da captura, para o operador abrir o card com o texto
 * pronto.
 */
export function gerarAnuncioEmBackground(
  vehicleId: string,
  rawDescription: string,
  dados: DadosDoAnuncio
): void {
  void (async () => {
    try {
      // Limpeza via GPT tem cache de 24 h: texto parecido nao paga de novo.
      const limpo = await cleanAdDescription(rawDescription);
      // A mesma precificacao da aprovacao: o "Por:" que o card mostra e o
      // que vai pro grupo.
      const { margemEfetiva, sellingPrice } = await precificar({
        price: dados.price,
        fipePrice: dados.fipePrice ?? extrairFipeDoTexto(rawDescription),
        km: dados.km,
        rawDescription,
        model: dados.model,
      });
      const formattedAd = formatVehicleAd(
        { ...dados, rawDescription: limpo || rawDescription },
        { profitMarginPercent: margemEfetiva }
      );
      // O card ja abre editavel: se o operador escreveu antes da IA terminar,
      // o texto dele vale.
      await db
        .update(veiculos)
        .set({ formattedAd, sellingPrice, ...carimboDeEdicao(null) })
        .where(vivosE(veiculos, eq(veiculos.id, vehicleId), isNull(veiculos.adEditedAt)));
      console.log(`[Webhook] Auto-formatted ad: ${vehicleId}`);
    } catch (e) {
      console.error("[Webhook] Auto ad-cleaner background failed:", e);
    }
  })();
}

/**
 * Com 2+ fotos, analisa todas, categoriza cada uma
 * (exterior/interior/motor/...) e reordena para a melhor ficar em destaque.
 * As categorias sao gravadas mesmo quando nao ha reordenacao: a tela usa elas
 * para avisar quando a foto destaque nao e do exterior.
 */
export function analisarFotosEmBackground(vehicleId: string, fotos: string[]): void {
  void (async () => {
    try {
      const { reordered, categories, originalBestIndex, changed } =
        await reorderPhotosByBest(fotos);
      await db
        .update(veiculos)
        .set({ photoCategories: JSON.stringify(categories), ...carimboDeEdicao(null) })
        .where(vivosE(veiculos, eq(veiculos.id, vehicleId)));
      // So reordena se as fotos ainda sao as analisadas. Nesse meio tempo o
      // operador pode ter editado a principal no card, ou o album ter trazido
      // mais fotos -- gravar a lista antiga apagaria as duas coisas.
      if (changed) {
        await db
          .update(veiculos)
          .set({ photos: JSON.stringify(reordered), ...carimboDeEdicao(null) })
          .where(vivosE(veiculos, eq(veiculos.id, vehicleId), eq(veiculos.photos, JSON.stringify(fotos))));
      }
      console.log(
        `[Webhook] Photo analyze: ${vehicleId} cats=${categories.join(",")}${
          changed ? ` (reordered, best was #${originalBestIndex})` : ""
        }`
      );
    } catch (e) {
      console.error("[Webhook] Photo picker background failed:", e);
    }
  })();
}
