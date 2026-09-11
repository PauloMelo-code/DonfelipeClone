import { eq } from "drizzle-orm";
import { db, veiculos, carimboDeEdicao, vivosE } from "@/lib/db";
import { lerConfiguracaoNumero } from "@/lib/settings";
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
      const margem = await lerConfiguracaoNumero("profit_margin_percent", 10);
      const formattedAd = formatVehicleAd(
        { ...dados, rawDescription: limpo || rawDescription },
        { profitMarginPercent: margem }
      );
      const sellingPrice = dados.price * (1 + margem / 100);
      await db
        .update(veiculos)
        .set({ formattedAd, sellingPrice, ...carimboDeEdicao(null) })
        .where(vivosE(veiculos, eq(veiculos.id, vehicleId)));
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
        .set({
          ...(changed ? { photos: JSON.stringify(reordered) } : {}),
          photoCategories: JSON.stringify(categories),
          ...carimboDeEdicao(null),
        })
        .where(vivosE(veiculos, eq(veiculos.id, vehicleId)));
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
