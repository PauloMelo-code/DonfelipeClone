// ---------------------------------------------------------------------------
// A forma dos dados de demonstracao.
//
// O array de veiculos e heterogeneo de proposito: um carro publicado tem data
// de aprovacao e de publicacao, um rejeitado tem motivo, um pendente nao tem
// nenhum dos dois. Sem este tipo, o codigo que grava precisava converter tudo
// pra `Record<string, unknown>` a cada campo opcional.
// ---------------------------------------------------------------------------

export type StatusDeDemo = "PENDING" | "APPROVED" | "PUBLISHED" | "REJECTED";

export interface VeiculoDeDemo {
  model: string;
  brand: string;
  year: number;
  yearModel?: number;
  km: number;
  price: number;
  fipePrice?: number;
  transmission?: string;
  fuel?: string;
  color?: string;
  plate?: string | null;
  features: string[];
  photos: string[];
  status: StatusDeDemo;
  /** Ha quantos dias o carro foi capturado. Todo veiculo tem. */
  capturedDaysAgo: number;
  /** So em aprovados e publicados. */
  approvedDaysAgo?: number;
  /** So em publicados. */
  publishedDaysAgo?: number;
  /** So em rejeitados. */
  rejectionReason?: string;
}

/** O que o passo de veiculos devolve pros passos seguintes. */
export interface VeiculoGravado {
  id: string;
  model: string;
  vehicleHash: string;
  status: StatusDeDemo;
  price: number;
  publishedDaysAgo?: number;
}
