// ---------------------------------------------------------------------------
// A forma do veiculo extraido de um anuncio.
//
// Todo extrator -- regex, GPT ou Gemini -- devolve isto. Manter num arquivo
// proprio evita o ciclo de import entre os extratores.
// ---------------------------------------------------------------------------

export interface VehicleData {
  model: string;
  brand?: string;
  year: number;
  yearModel?: number;
  km: number;
  price: number;
  fipePrice?: number;
  transmission?: string;
  fuel?: string;
  color?: string;
  plate?: string;
  location?: string;
  state?: string;
  features: string[];
  photos: string[];
  rawDescription?: string;
  sellerPhone?: string;
}
