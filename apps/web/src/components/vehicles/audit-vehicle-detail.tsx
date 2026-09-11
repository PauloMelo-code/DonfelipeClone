"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Loader2, Copy, Car } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AIInsights } from "./ai-insights";

interface VehicleData {
  id: string;
  model: string;
  brand: string | null;
  year: number;
  km: number;
  price: number;
  sellingPrice: number | null;
  fipePrice: number | null;
  photos: string;
  formattedAd: string | null;
  rawDescription: string | null;
  status: string;
}

interface AuditVehicleDetailProps {
  vehicleId: string;
  className?: string;
}

function safeParseArray(val: string | string[] | null | undefined): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

/**
 * Detalhe completo de veiculo para usar na expansao da Auditoria:
 * - Esquerda: anuncio formatado no estilo WhatsApp
 * - Direita: AIInsights (analise inteligente)
 *
 * Faz 1 fetch interno do veiculo + AIInsights tem fetch proprio.
 */
export function AuditVehicleDetail({ vehicleId, className }: AuditVehicleDetailProps) {
  const [vehicle, setVehicle] = useState<VehicleData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!vehicleId) return;
    setLoading(true);
    fetch(`/api/vehicles/${vehicleId}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setVehicle)
      .catch(() => setVehicle(null))
      .finally(() => setLoading(false));
  }, [vehicleId]);

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <Loader2 className="h-5 w-5 animate-spin text-brand-gold" />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className={cn("py-6 text-center text-xs text-muted-foreground", className)}>
        Veículo não encontrado (pode ter sido excluído)
      </div>
    );
  }

  const photos = safeParseArray(vehicle.photos);
  const adText = vehicle.formattedAd || vehicle.rawDescription || "Sem texto disponível";

  const handleCopy = () => {
    navigator.clipboard.writeText(adText);
    toast.success("Texto copiado!");
  };

  return (
    <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-4", className)}>
      {/* Anúncio (estilo WhatsApp) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
            Anúncio publicado
          </p>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[10px] text-brand-gold hover:text-brand-gold-light transition-colors"
          >
            <Copy className="h-3 w-3" />
            Copiar texto
          </button>
        </div>
        <div className="rounded-xl overflow-hidden ring-1 ring-white/[0.06]">
          <div className="bg-[#1F2C34] px-3 py-2 flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-[#2A3942] flex items-center justify-center">
              <MessageCircle className="h-3.5 w-3.5 text-[#8696A0]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#E9EDEF] truncate">
                {vehicle.brand && `${vehicle.brand} `}{vehicle.model}
              </p>
              <p className="text-[10px] text-[#8696A0]">{vehicle.year} · {vehicle.km.toLocaleString("pt-BR")} km</p>
            </div>
          </div>
          {/* Bolha WhatsApp simplificada */}
          <div
            className="p-3 max-h-[400px] overflow-y-auto"
            style={{
              backgroundColor: "#0B141A",
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          >
            <div className="max-w-[90%] ml-auto">
              <div className="bg-[#005C4B] rounded-lg overflow-hidden shadow-lg">
                {photos[0] && (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photos[0]} alt="" className="w-full h-36 object-cover" />
                    {photos.length > 1 && (
                      <div className="absolute bottom-2 right-2 bg-black/60 rounded-full px-2 py-0.5 text-[10px] text-white">
                        1/{photos.length}
                      </div>
                    )}
                  </div>
                )}
                {!photos[0] && (
                  <div className="bg-[#1F2C34] h-32 flex items-center justify-center">
                    <Car className="h-8 w-8 text-[#8696A0]/40" />
                  </div>
                )}
                <div className="px-2.5 py-1.5">
                  <p className="text-[12px] text-[#E9EDEF] whitespace-pre-wrap leading-[18px]">
                    {adText}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Insights */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
          Análise inteligente
        </p>
        <AIInsights vehicleId={vehicleId} />
      </div>
    </div>
  );
}
