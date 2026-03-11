export type VehicleStatus = "PENDING" | "APPROVED" | "REJECTED" | "PUBLISHED";

export type FuelType =
  | "GASOLINA"
  | "ETANOL"
  | "FLEX"
  | "DIESEL"
  | "HIBRIDO"
  | "ELETRICO";

export type TransmissionType = "AUTOMATICO" | "MANUAL" | "CVT";

export type GroupRole = "SOURCE" | "TARGET";

export type UserRole = "ADMIN" | "OPERATOR";

export interface VehicleData {
  model: string;
  brand?: string;
  year: number;
  yearModel?: number;
  km: number;
  price: number;
  fipePrice?: number;
  transmission?: TransmissionType;
  fuel?: FuelType;
  color?: string;
  plate?: string;
  features: string[];
  photos: string[];
  rawDescription?: string;
  sellerPhone?: string;
}

export interface FilterCriteria {
  minYear?: number;
  maxYear?: number;
  minPrice?: number;
  maxPrice?: number;
  minKm?: number;
  maxKm?: number;
  models?: string[];
  excludeModels?: string[];
}
