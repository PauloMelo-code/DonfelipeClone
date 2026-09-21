// ---------------------------------------------------------------------------
// A leitura da margem contra a tabela FIPE.
//
// E o numero que decide a compra, e ja enganou o operador antes. Um anuncio
// sem valor de oferta chegava com preco zerado e a tela mostrava "-0% FIPE",
// que parece um negocio ruim mas honesto -- quando na verdade nao havia preco
// nenhum. Por isso os casos degenerados avisam em vez de calcular.
// ---------------------------------------------------------------------------

import { lerFipeDoAnuncio, lerPrecoDeVenda } from "@/lib/vehicle-formatter";

export type NivelDeMargem = "otima" | "boa" | "magra" | "negativa" | "alerta";

export interface Margem {
  nivel: NivelDeMargem;
  rotulo: string;
  /** Desconto em pontos percentuais. Ausente nos casos de alerta. */
  desconto?: number;
}

/** A partir daqui a margem paga o trabalho com folga. */
export const MARGEM_OTIMA = 15;
/** Abaixo disso o carro entra como "sem margem" na regra de negocio. */
export const MARGEM_BOA = 8;

/**
 * Como esta o preco pedido em relacao a FIPE.
 *
 * Devolve `null` quando nao ha FIPE pra comparar -- sem referencia nao ha o
 * que dizer, e inventar um numero seria pior que ficar calado.
 */
export function classificarMargem(preco: number, fipe?: number | null): Margem | null {
  if (!fipe || fipe <= 0) return null;

  // Preco invalido: nao da pra calcular desconto de coisa nenhuma.
  if (!preco || !Number.isFinite(preco) || preco <= 0) {
    return { nivel: "alerta", rotulo: "Sem oferta" };
  }

  // Preco igual a FIPE quase sempre significa que o anuncio repetiu a tabela
  // no lugar do valor pedido.
  if (preco === fipe) {
    return { nivel: "alerta", rotulo: "= FIPE (s/ oferta?)" };
  }

  const desconto = Math.round((1 - preco / fipe) * 100);
  if (!Number.isFinite(desconto)) return null;

  if (desconto >= MARGEM_OTIMA) return { nivel: "otima", desconto, rotulo: `-${desconto}% FIPE` };
  if (desconto >= MARGEM_BOA) return { nivel: "boa", desconto, rotulo: `-${desconto}% FIPE` };
  if (desconto >= 0) return { nivel: "magra", desconto, rotulo: `-${desconto}% FIPE` };
  return { nivel: "negativa", desconto, rotulo: `+${Math.abs(desconto)}% FIPE` };
}

/**
 * Quanto o preco de VENDA ficou abaixo da Fipe -- o segundo selo do card.
 *
 * Pedido do cliente (21/09/2026): o selo de cima compara o preco do
 * fornecedor com a Fipe; este compara o "Por:" que ele poe no anuncio com a
 * "Fipe:" que ele informou, os dois lidos do texto da caixa, e muda enquanto
 * ele digita. Sem linha "Fipe:" no texto, vale a Fipe do carro.
 */
export function margemDoPor(
  texto: string | null | undefined,
  fipeDoCarro?: number | null
): { desconto: number; rotulo: string } | null {
  const por = lerPrecoDeVenda(texto);
  const fipe = lerFipeDoAnuncio(texto) ?? fipeDoCarro ?? null;
  if (!por || !fipe || fipe <= 0) return null;
  const desconto = Math.round((1 - por / fipe) * 100);
  if (!Number.isFinite(desconto)) return null;
  const rotulo = desconto > 0 ? `Por -${desconto}% FIPE` : desconto < 0 ? `Por +${-desconto}% FIPE` : "Por = FIPE";
  return { desconto, rotulo };
}

export const ESTILO_DA_MARGEM: Record<NivelDeMargem, string> = {
  otima: "bg-success/15 border-success/40 text-success font-bold",
  boa: "bg-success/10 border-success/30 text-success",
  magra: "bg-warning/10 border-warning/30 text-warning",
  negativa: "bg-destructive/10 border-destructive/30 text-destructive",
  alerta: "bg-warning/10 border-warning/30 text-warning",
};
