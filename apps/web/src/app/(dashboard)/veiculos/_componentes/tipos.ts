// ---------------------------------------------------------------------------
// O vocabulario da tela de veiculos.
//
// Tipos, constantes e funcoes puras que a pagina, os dialogos e os ganchos
// compartilham. Nada aqui tem estado nem toca a rede -- e o que pode ser
// importado de qualquer lado sem criar ciclo.
// ---------------------------------------------------------------------------
import { anuncioParaExibir, formatVehicleAd } from "@/lib/vehicle-formatter";

export interface WhatsAppGroup {
  id: string;
  groupId: string;
  name: string;
  role: string;
  active: boolean;
  region: string | null;
}

export interface Vehicle {
  id: string;
  model: string;
  brand: string | null;
  year: number;
  yearModel: number | null;
  km: number;
  price: number;
  sellingPrice: number | null;
  fipePrice: number | null;
  transmission: string | null;
  fuel: string | null;
  color: string | null;
  features: string | string[];
  photos: string | string[];
  status: string;
  formattedAd: string | null;
  /** Quando o operador editou o texto do anuncio. Nulo = texto gerado. */
  adEditedAt?: string | null;
  rejectionReason: string | null;
  rawDescription: string | null;
  internalNotes?: string | null;
  capturedAt: string;
  sourceGroupId: string | null;
  sourceGroup: {
    name: string;
    groupId: string;
    isCommunity?: boolean;
    isAnnounce?: boolean;
    isContact?: boolean;
    kindOverride?: string | null;
    ownerPhone?: string | null;
    region?: string | null;
  } | null;
  state?: string | null;
  qualityScore?: number | null;
  isVip?: boolean;
  autoRejectedReason?: string | null;
  preparedAt?: string | null;
  preparedTargetGroupIds?: string | null;
}

export const REJECTION_OPTIONS = [
  { id: "fora_padrao", label: "Não é o padrão de veículo que trabalhamos" },
  { id: "sem_margem", label: "Sem margem (mínimo 10% abaixo da FIPE)" },
  { id: "fora_sul", label: "Não está localizado no Sul do Brasil" },
  { id: "repetido", label: "Repetido, já apareceu antes" },
  { id: "km_alta", label: "Km alta com pouca margem" },
  { id: "modelo_mais_margem", label: "Esse modelo precisa de mais margem" },
  { id: "sem_foto", label: "Anúncio sem foto / foto errada" },
  { id: "leilao_pouca_margem", label: "Leilão com pouca margem" },
  { id: "sem_valor_oferta", label: "Sem valor da oferta" },
  { id: "muitos_reparos_pouca_margem", label: "Muitos reparos e pouca margem" },
] as const;

export const statusConfig: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Pendente", color: "bg-warning/10 text-warning border-warning/20" },
  APPROVED: { label: "Aprovado", color: "bg-success/10 text-success border-success/20" },
  REJECTED: { label: "Rejeitado", color: "bg-destructive/10 text-destructive border-destructive/20" },
  PUBLISHED: { label: "Publicado", color: "bg-brand-gold/10 text-brand-gold border-brand-gold/20" },
};

/** Fotos e opcionais chegam ora como array, ora como JSON em texto. */
export function parseArray(val: string | string[]): string[] {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val || "[]"); } catch { return []; }
}

export const formatPrice = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const formatKm = (v: number) => v.toLocaleString("pt-BR") + " km";

/** Estado do veiculo: o que a IA extraiu, senao a regiao do grupo de origem. */
export function estadoDoVeiculo(v: Vehicle): string | null {
  return v.state || v.sourceGroup?.region || null;
}

/** Monta o anuncio do zero a partir dos dados do veiculo. */
export function textoDoAnuncio(v: Vehicle, marginOverride?: number) {
  return formatVehicleAd(
    {
      model: v.model,
      brand: v.brand,
      year: v.year,
      yearModel: v.yearModel,
      km: v.km,
      price: v.price,
      fipePrice: v.fipePrice,
      transmission: v.transmission,
      fuel: v.fuel,
      features: v.features,
      rawDescription: v.rawDescription,
    },
    { profitMarginPercent: marginOverride ?? 0 }
  );
}

/** O texto salvo tem prioridade sobre o gerado -- com o titulo no padrao atual. */
export function textoDePreview(v: Vehicle) {
  return anuncioParaExibir(v) ?? textoDoAnuncio(v);
}
