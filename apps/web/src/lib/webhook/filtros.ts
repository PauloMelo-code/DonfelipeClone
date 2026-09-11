import { applyFilters } from "@/lib/vehicle-parser";
import { lerConfiguracao, lerConfiguracaoNumero } from "@/lib/settings";

// ---------------------------------------------------------------------------
// Filtros de captura: o que entra na fila de revisao e o que e descartado.
//
// Sao duas camadas. A GLOBAL vem das configuracoes (ano minimo, preco minimo,
// km maxima, desconto minimo sobre a FIPE) e vale para todo grupo. A do GRUPO
// vem do JSON em `whatsapp_groups.filters`, mais a regra especial de grupo
// "Nacional".
//
// Cada recusa devolve um `reason` estavel: e por ele que a tela de analise
// explica ao operador por que o carro nao apareceu.
// ---------------------------------------------------------------------------

/** Acima disso e erro de parsing decimal, nao carro de repasse. */
const PRECO_SUSPEITO = 2_000_000;

export interface EntradaFiltros {
  model: string;
  brand: string | null;
  year: number;
  km: number;
  price: number;
  state: string | null;
  transmission: string | null;
  fuel: string | null;
  features: string[];
  photos: string[];
  fipePrice: number | null;
  grupo: { region: string | null; filters: string | null; name: string };
}

export type ResultadoFiltros =
  | { passou: true; fipePrice: number | null }
  | { passou: false; resposta: Record<string, unknown> };

const recusa = (resposta: Record<string, unknown>): ResultadoFiltros => ({
  passou: false,
  resposta: { status: "filtered", ...resposta },
});

export async function aplicarFiltros(e: EntradaFiltros): Promise<ResultadoFiltros> {
  const { model, year, km, price, state, grupo } = e;
  let fipePrice = e.fipePrice;

  // ── Globais, vindos das configuracoes ────────────────────────────────
  const minYear = Math.trunc(await lerConfiguracaoNumero("filter_min_year", 2018));
  if (year < minYear) {
    return recusa({ reason: "vehicle_too_old", year, minYear });
  }

  const minPrice = await lerConfiguracaoNumero("filter_min_price", 30000);
  if (price < minPrice) {
    return recusa({ reason: "vehicle_price_too_low", price, minPrice });
  }

  // Sanity check: "78.200.00" lido como 7.820.000. Descarta e loga.
  if (price > PRECO_SUSPEITO) {
    console.warn(
      `[Webhook] SUSPECT price ${price} for "${model}" -- provavelmente erro de parsing decimal`
    );
    return recusa({ reason: "price_likely_parse_error", price });
  }
  // Mesma protecao para a FIPE: aqui nao descarta o carro, so ignora a FIPE.
  if (fipePrice && fipePrice > PRECO_SUSPEITO) {
    console.warn(`[Webhook] SUSPECT fipePrice ${fipePrice} -- ignorando FIPE`);
    fipePrice = null;
  }

  const maxKm = Math.trunc(await lerConfiguracaoNumero("filter_max_km", 300000));
  if (km > maxKm) {
    console.log(`[Webhook] FILTERED km too high: ${km} > ${maxKm}`);
    return recusa({ reason: "vehicle_km_too_high", km, maxKm });
  }

  // Desconto minimo sobre a FIPE. Sem FIPE detectada, passa: o operador revisa.
  if (fipePrice && fipePrice > 0) {
    const minDiscount = await lerConfiguracaoNumero("min_fipe_discount", 10);
    const discountPct = (1 - price / fipePrice) * 100;
    if (discountPct < minDiscount) {
      console.log(
        `[Webhook] FILTERED low FIPE discount: ${discountPct.toFixed(1)}% < ${minDiscount}% (price ${price} / fipe ${fipePrice})`
      );
      return recusa({
        reason: "fipe_discount_too_low",
        discountPct: Math.round(discountPct * 10) / 10,
        minDiscount,
      });
    }
  }

  // ── Grupo "Nacional" ─────────────────────────────────────────────────
  // Recebe carro do Brasil inteiro e a maioria dos anuncios de fora da regiao
  // nao menciona o estado. Regra do cliente: "se nao colocar nada, esta fora".
  if ((grupo.region || "").toUpperCase() === "NACIONAL") {
    const servedSetting = await lerConfiguracao("served_states");
    const servedStates = (servedSetting || "RS,SC,PR,SP")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const detectedState = state ? state.toUpperCase() : null;
    if (!detectedState || !servedStates.includes(detectedState)) {
      console.log(
        `[Webhook] FILTERED national group: estado=${detectedState ?? "NAO_DETECTADO"} (atendidos: ${servedStates.join(",")})`
      );
      return recusa({
        reason: detectedState
          ? "national_group_state_not_served"
          : "national_group_no_state_mentioned",
        state: detectedState ?? "nao_detectado",
        servedStates,
      });
    }
  }

  // ── Filtros proprios do grupo ────────────────────────────────────────
  let filtrosDoGrupo: Record<string, unknown> | null = null;
  try {
    filtrosDoGrupo = grupo.filters ? JSON.parse(grupo.filters) : null;
  } catch {
    console.warn("[Webhook] Invalid JSON in group.filters for", grupo.name);
  }

  if (filtrosDoGrupo) {
    const permitidos = filtrosDoGrupo.allowedStates as string[] | undefined;
    if (permitidos && permitidos.length > 0 && state) {
      const lista = permitidos.map((s) => s.toUpperCase());
      if (!lista.includes(state.toUpperCase())) {
        return recusa({ reason: "state_not_allowed", state, allowedStates: lista });
      }
    }

    const passou = applyFilters(
      {
        model,
        brand: e.brand ?? undefined,
        year,
        km,
        price,
        transmission: e.transmission ?? undefined,
        fuel: e.fuel ?? undefined,
        features: e.features,
        photos: e.photos,
      },
      filtrosDoGrupo
    );
    if (!passou) return recusa({ reason: "group_filters" });
  }

  return { passou: true, fipePrice };
}
