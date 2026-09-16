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
  onDeletePhoto?: (vehicleId: string, photoIndex: number) => void;
  onSetMainPhoto?: (vehicleId: string, photoIndex: number) => void;
  actionLoading: string | null;
  onPublishDirect?: (id: string) => void;
  onUpdateField?: (id: string, field: string, value: string | number) => Promise<void>;
  publishingDirectId?: string | null;
  onEditPhoto?: (vehicle: SwipeVehicle) => void;
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

export const formatPrice = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const formatKm = (v: number) => v.toLocaleString("pt-BR") + " km";
