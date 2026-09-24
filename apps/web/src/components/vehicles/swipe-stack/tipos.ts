// ---------------------------------------------------------------------------
// O vocabulario da pilha de triagem.
//
// Esta e a tela onde o operador decide o destino de cada carro capturado: um
// de cada vez, arrastando pra um lado ou pro outro.
// ---------------------------------------------------------------------------

export interface SwipeVehicle {
  id: string;
  model: string;
  brand: string | null;
  year: number;
  km: number;
  price: number;
  sellingPrice: number | null;
  fipePrice: number | null;
  transmission: string | null;
  fuel: string | null;
  color: string | null;
  features: string[];
  photos: string[];
  status: string;
  location?: string | null;
  state?: string | null;
  rawDescription?: string | null;
  /** O anuncio como vai para o grupo, e quando o operador o editou. */
  formattedAd?: string | null;
  adEditedAt?: string | null;
  internalNotes?: string | null;
  capturedAt?: string;
  qualityScore?: number | null;
  isVip?: boolean;
  sourceGroup?: {
    name: string;
    groupId: string;
    isCommunity?: boolean;
    isAnnounce?: boolean;
    isContact?: boolean;
    /** Tipo escolhido a mao na tela de Grupos. */
    kindOverride?: string | null;
    ownerPhone?: string | null;
    region?: string | null;
  } | null;
}

/**
 * O que o bloco de dados do card le -- e so isso.
 *
 * Declarado a parte de `SwipeVehicle` porque a grade de cards da tela de
 * Veiculos usa o MESMO bloco, e la o veiculo tem fotos e opcionais em texto
 * JSON. Nenhum dos dois campos e lido aqui, entao os dois tipos servem.
 */
export interface VeiculoDoCard {
  id: string;
  model: string;
  brand?: string | null;
  year: number;
  km: number;
  price: number;
  fipePrice?: number | null;
  transmission?: string | null;
  fuel?: string | null;
  color?: string | null;
  location?: string | null;
  state?: string | null;
  capturedAt?: string;
  qualityScore?: number | null;
  isVip?: boolean;
  rawDescription?: string | null;
  formattedAd?: string | null;
  adEditedAt?: string | null;
  sourceGroup?: {
    name: string;
    groupId: string;
    isCommunity?: boolean;
    isAnnounce?: boolean;
    isContact?: boolean;
    kindOverride?: string | null;
    ownerPhone?: string | null;
    region?: string | null;
  } | null;
}

/** O que a pilha precisa saber fazer. O card recebe o mesmo conjunto mais o seu estado. */
export interface SwipeStackProps {
  vehicles: SwipeVehicle[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onPhotoClick?: (vehicle: SwipeVehicle) => void;
  onSetMainPhoto?: (vehicleId: string, photoIndex: number) => void;
  /** A foto principal foi editada no card (recorte, blur ou pincel), ou voltou a original. */
  onPhotoEdited?: (vehicleId: string, photo: string) => void;
  actionLoading: string | null;
  onPublishDirect?: (id: string) => void;
  onUpdateField?: (id: string, field: string, value: string | number) => Promise<void>;
  publishingDirectId?: string | null;
}

/**
 * As props do card.
 *
 * Herda tudo da pilha menos a lista, e acrescenta o que so o card sabe: se e
 * ele que esta por cima e pra que lado vai sair da tela.
 */
export interface CardProps extends Omit<SwipeStackProps, "vehicles"> {
  vehicle: SwipeVehicle;
  isTop: boolean;
  exitDir: "left" | "right" | null;
}

/** Quanto o dedo precisa percorrer pra decidir o carro. */
export const DISTANCIA_DE_DECISAO = 150;

/**
 * Ha quanto tempo o carro chegou. O repasse gira rapido e o cliente quer ver,
 * de relance, se o anuncio e de agora ou de ontem (23/09/2026).
 */
export function quandoChegou(iso: string, agora: Date = new Date()): string {
  const quando = new Date(iso);
  if (Number.isNaN(quando.getTime())) return "";
  const minutos = Math.floor((agora.getTime() - quando.getTime()) / 60000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24 && quando.getDate() === agora.getDate()) return `há ${horas}h`;
  const hora = quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const ontem = new Date(agora);
  ontem.setDate(ontem.getDate() - 1);
  if (quando.toDateString() === ontem.toDateString()) return `ontem ${hora}`;
  return `${quando.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hora}`;
}

/** Data e hora por extenso, para o `title` do card. */
export const horaDaCaptura = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export const formatPrice = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const formatKm = (v: number) => v.toLocaleString("pt-BR") + " km";
