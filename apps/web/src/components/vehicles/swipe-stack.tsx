"use client";

import { useState, useCallback } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  AnimatePresence,
} from "framer-motion";
import { Check, X, Car, ZoomIn, MapPin, Trash2, Send, Loader2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineEdit } from "./inline-edit";

interface SwipeVehicle {
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
  capturedAt?: string;
  sourceGroup?: {
    name: string;
    groupId: string;
    isCommunity?: boolean;
    isAnnounce?: boolean;
    ownerPhone?: string | null;
    region?: string | null;
  } | null;
}

interface SwipeStackProps {
  vehicles: SwipeVehicle[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onPhotoClick?: (vehicle: SwipeVehicle) => void;
  onDeletePhoto?: (vehicleId: string, photoIndex: number) => void;
  actionLoading: string | null;
  onPublishDirect?: (id: string) => void;
  onUpdateField?: (id: string, field: string, value: string | number) => Promise<void>;
  publishingDirectId?: string | null;
  onEditPhoto?: (vehicle: SwipeVehicle) => void;
}

function MarginBadge({ price, fipePrice }: { price: number; fipePrice?: number | null }) {
  if (!fipePrice || fipePrice <= 0) return null;
  const discount = Math.round((1 - price / fipePrice) * 100);
  let style: string;
  let label: string;
  if (discount >= 15) {
    style = "bg-success/15 border-success/40 text-success font-bold";
    label = `-${discount}% FIPE`;
  } else if (discount >= 8) {
    style = "bg-success/10 border-success/30 text-success";
    label = `-${discount}% FIPE`;
  } else if (discount >= 0) {
    style = "bg-warning/10 border-warning/30 text-warning";
    label = `-${discount}% FIPE`;
  } else {
    style = "bg-destructive/10 border-destructive/30 text-destructive";
    label = `+${Math.abs(discount)}% FIPE`;
  }
  return <span className={cn("rounded-full border px-2 py-0.5 text-xs whitespace-nowrap", style)}>{label}</span>;
}

function SwipeCard({
  vehicle,
  isTop,
  onApprove,
  onReject,
  onPhotoClick,
  onDeletePhoto,
  actionLoading,
  exitDir,
  onPublishDirect,
  onUpdateField,
  publishingDirectId,
  onEditPhoto,
}: {
  vehicle: SwipeVehicle;
  isTop: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onPhotoClick?: (vehicle: SwipeVehicle) => void;
  onDeletePhoto?: (vehicleId: string, photoIndex: number) => void;
  actionLoading: string | null;
  exitDir: "left" | "right" | null;
  onPublishDirect?: (id: string) => void;
  onUpdateField?: (id: string, field: string, value: string | number) => Promise<void>;
  publishingDirectId?: string | null;
  onEditPhoto?: (vehicle: SwipeVehicle) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-18, 0, 18]);
  const approveOpacity = useTransform(x, [0, 80, 200], [0, 0.6, 1]);
  const rejectOpacity = useTransform(x, [-200, -80, 0], [1, 0.6, 0]);

  const formatPrice = (v: number) =>
    v.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    });

  const formatKm = (v: number) => v.toLocaleString("pt-BR") + " km";

  const handleDragEnd = (_: unknown, info: { offset: { x: number } }) => {
    if (info.offset.x > 150) {
      onApprove(vehicle.id);
    } else if (info.offset.x < -150) {
      onReject(vehicle.id);
    }
  };

  return (
    <motion.div
      className={cn(
        isTop
          ? "relative z-10 cursor-grab active:cursor-grabbing"
          : "absolute inset-x-2 top-3 z-0 pointer-events-none"
      )}
      style={isTop ? { x, rotate, touchAction: "pan-y" } : undefined}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={isTop ? handleDragEnd : undefined}
      initial={{ scale: isTop ? 1 : 0.95, opacity: isTop ? 1 : 0.6 }}
      animate={{
        scale: isTop ? 1 : 0.95,
        opacity: isTop ? 1 : 0.6,
      }}
      exit={{ x: exitDir === "left" ? -300 : 300, opacity: 0, transition: { duration: 0.3 } }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <div className="rounded-2xl overflow-hidden flex flex-col bg-[#141414] border border-white/[0.06]">
        {/* Swipe Overlays */}
        {isTop && (
          <>
            <motion.div
              className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-4 border-success bg-success/10 pointer-events-none"
              style={{ opacity: approveOpacity }}
            >
              <div className="rounded-full bg-success/20 p-6">
                <Check className="h-16 w-16 text-success" strokeWidth={3} />
              </div>
            </motion.div>
            <motion.div
              className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-4 border-destructive bg-destructive/10 pointer-events-none"
              style={{ opacity: rejectOpacity }}
            >
              <div className="rounded-full bg-destructive/20 p-6">
                <X className="h-16 w-16 text-destructive" strokeWidth={3} />
              </div>
            </motion.div>
          </>
        )}

        {/* Photo — always shows first photo only */}
        <div className="relative h-48 sm:h-60 bg-card shrink-0 group/photo">
          {vehicle.photos.length > 0 ? (
            <img
              src={vehicle.photos[0]}
              alt={vehicle.model}
              className="h-full w-full object-cover pointer-events-none select-none"
              draggable={false}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Car className="h-16 w-16 text-muted-foreground/20" />
            </div>
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
          {/* Click to preview */}
          {isTop && onPhotoClick && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onPhotoClick(vehicle);
              }}
              className="absolute top-3 right-3 z-30 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white/80 hover:text-white hover:bg-black/80 transition-all pointer-events-auto"
            >
              <ZoomIn className="h-3.5 w-3.5" />
              Ver original
            </button>
          )}
          {isTop && onDeletePhoto && vehicle.photos.length > 0 && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("Excluir esta foto?")) onDeletePhoto(vehicle.id, 0);
              }}
              className="absolute top-3 left-3 z-30 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-destructive/80 hover:text-destructive hover:bg-black/80 transition-all pointer-events-auto"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir
            </button>
          )}
          {isTop && onEditPhoto && vehicle.photos.length > 0 && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onEditPhoto(vehicle);
              }}
              className="absolute top-12 left-3 z-30 flex items-center gap-1.5 rounded-full bg-cugini-orange/90 px-2.5 py-1 text-[11px] text-white hover:bg-cugini-orange transition-all pointer-events-auto"
              title="Editar foto (cortar/pintar)"
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar foto
            </button>
          )}
          <div className="absolute bottom-3 left-4 right-4">
            <h3 className="text-lg font-bold text-white drop-shadow-lg">
              {vehicle.brand && `${vehicle.brand} `}
              {vehicle.model}
            </h3>
          </div>
        </div>

        {/* Info */}
        <div className="p-4 flex flex-col gap-3">
          {(() => {
            // Estado de origem: usa state do veiculo, ou fallback para region do grupo
            const stateLabel = vehicle.state || vehicle.sourceGroup?.region;
            const isFromGroup = !vehicle.state && !!vehicle.sourceGroup?.region;
            if (!stateLabel) return null;
            return (
              <div className="flex items-center gap-2 -mt-1 flex-wrap">
                <span className="inline-flex items-center gap-1 rounded-md bg-cugini-orange/15 border border-cugini-orange/30 px-2 py-0.5 text-xs font-semibold text-cugini-orange uppercase tracking-wide">
                  <MapPin className="h-3 w-3" /> {stateLabel}
                  {isFromGroup && <span className="text-[10px] opacity-60 normal-case ml-0.5">(grupo)</span>}
                </span>
                {vehicle.location && <span className="text-xs text-muted-foreground">{vehicle.location}</span>}
              </div>
            );
          })()}

          {/* Origem do veiculo (grupo/comunidade/canal/lista/contato) */}
          {vehicle.sourceGroup && (() => {
            const sg = vehicle.sourceGroup;
            const jid = sg.groupId || "";
            const isBroadcast = jid.endsWith("@broadcast");
            const isNewsletter = jid.endsWith("@newsletter");
            const isPrivate = jid.endsWith("@s.whatsapp.net");

            let sourceLabel: string;
            let sourceIcon: string;
            if (sg.isAnnounce || isNewsletter) { sourceLabel = "Canal"; sourceIcon = "📡"; }
            else if (sg.isCommunity) { sourceLabel = "Comunidade"; sourceIcon = "🏘️"; }
            else if (isBroadcast) { sourceLabel = "Lista de transmissao"; sourceIcon = "📢"; }
            else if (isPrivate) { sourceLabel = "Contato"; sourceIcon = "👤"; }
            else { sourceLabel = "Grupo"; sourceIcon = "👥"; }

            // Para lista de transmissao sem nome, exibe o numero
            const displayName = sg.name || (sg.ownerPhone ? `+${sg.ownerPhone}` : jid.replace(/@.*/, ""));

            return (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80 -mt-1">
                <span>{sourceIcon}</span>
                <span className="font-medium text-muted-foreground">{sourceLabel}:</span>
                <span className="truncate flex-1 text-foreground/70">{displayName}</span>
              </div>
            );
          })()}

          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
            {onUpdateField ? (
              <InlineEdit
                value={vehicle.year}
                type="number"
                onSave={(v) => onUpdateField(vehicle.id, "year", v)}
                className="text-foreground"
              />
            ) : <span>{vehicle.year}</span>}
            <span className="text-border">&bull;</span>
            {onUpdateField ? (
              <InlineEdit
                value={vehicle.km}
                type="number"
                onSave={(v) => onUpdateField(vehicle.id, "km", v)}
                format={(v) => `${Number(v).toLocaleString("pt-BR")} km`}
                className="text-foreground"
              />
            ) : <span>{formatKm(vehicle.km)}</span>}
            {vehicle.transmission && (
              <>
                <span className="text-border">&bull;</span>
                <span>{vehicle.transmission}</span>
              </>
            )}
            {vehicle.fuel && (
              <>
                <span className="text-border">&bull;</span>
                <span>{vehicle.fuel}</span>
              </>
            )}
          </div>

          {vehicle.color && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>Cor: {vehicle.color}</span>
            </div>
          )}

          <div className="flex items-baseline justify-between">
            <div>
              {vehicle.fipePrice && (
                <p className="text-xs text-muted-foreground">
                  FIPE: {formatPrice(vehicle.fipePrice)}
                </p>
              )}
              <p className="text-xl font-bold text-cugini-orange">
                {onUpdateField ? (
                  <InlineEdit
                    value={vehicle.price}
                    type="number"
                    onSave={(v) => onUpdateField(vehicle.id, "price", v)}
                    format={(v) => formatPrice(Number(v))}
                  />
                ) : formatPrice(vehicle.price)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <MarginBadge price={vehicle.price} fipePrice={vehicle.fipePrice} />
              {vehicle.fuel === "HIBRIDO" && (
                <span className="rounded-full border border-success/30 px-2 py-0.5 text-xs text-success">
                  Hibrido
                </span>
              )}
            </div>
          </div>

          {/* Raw description — WhatsApp style */}
          {vehicle.rawDescription && (
            <div
              className="rounded-xl px-3 py-2.5 max-h-[30vh] overflow-y-auto"
              style={{ background: "#005C4B", WebkitOverflowScrolling: "touch" }}
            >
              <p className="text-[12px] text-[#E9EDEF] whitespace-pre-wrap leading-[18px]">
                {vehicle.rawDescription}
              </p>
            </div>
          )}

          {/* Buttons */}
          {isTop && (
            <div className="grid grid-cols-3 gap-2 mt-auto pt-3">
              <button
                onClick={(e) => { e.stopPropagation(); onReject(vehicle.id); }}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={actionLoading === vehicle.id || publishingDirectId === vehicle.id}
                className="flex items-center justify-center gap-1.5 rounded-xl py-3 border-2 border-destructive/30 text-destructive font-medium transition-all hover:bg-destructive/10 hover:border-destructive/50 active:scale-95 min-h-[48px] disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                <span className="text-sm">Rejeitar</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onApprove(vehicle.id); }}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={actionLoading === vehicle.id || publishingDirectId === vehicle.id}
                className="flex items-center justify-center gap-1.5 rounded-xl py-3 border-2 border-border bg-card/50 text-foreground font-medium transition-all hover:border-white/30 active:scale-95 min-h-[48px] disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                <span className="text-sm">Aprovar</span>
              </button>
              {onPublishDirect && (
                <button
                  onClick={(e) => { e.stopPropagation(); onPublishDirect(vehicle.id); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  disabled={actionLoading === vehicle.id || publishingDirectId === vehicle.id}
                  className="flex items-center justify-center gap-1.5 rounded-xl py-3 bg-gradient-to-br from-success to-success/70 text-white font-semibold transition-all hover:shadow-[0_0_20px_rgba(52,211,153,0.4)] active:scale-95 min-h-[48px] disabled:opacity-50"
                >
                  {publishingDirectId === vehicle.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  <span className="text-sm">Publicar</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function SwipeStack({
  vehicles,
  onApprove,
  onReject,
  onPhotoClick,
  onDeletePhoto,
  actionLoading,
  onPublishDirect,
  onUpdateField,
  publishingDirectId,
  onEditPhoto,
}: SwipeStackProps) {
  const [exitDirection, setExitDirection] = useState<"left" | "right" | null>(
    null
  );

  const handleApprove = useCallback(
    (id: string) => {
      setExitDirection("right");
      onApprove(id);
    },
    [onApprove]
  );

  const handleReject = useCallback(
    (id: string) => {
      setExitDirection("left");
      onReject(id);
    },
    [onReject]
  );

  if (vehicles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Car className="mb-3 h-12 w-12 opacity-30" />
        <p className="text-sm">Nenhum veiculo pendente</p>
      </div>
    );
  }

  // Show top 2 cards for the stack effect
  const visibleCards = vehicles.slice(0, 2).reverse();

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Swipe hint */}
      <div className="flex items-center gap-8 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <X className="h-3.5 w-3.5 text-destructive" /> Arraste para rejeitar
        </span>
        <span className="flex items-center gap-1">
          Arraste para aprovar{" "}
          <Check className="h-3.5 w-3.5 text-success" />
        </span>
      </div>

      {/* Card stack */}
      <div className="relative w-full max-w-sm mx-auto">
        <AnimatePresence
          mode="popLayout"
          custom={exitDirection}
        >
          {visibleCards.map((vehicle, index) => (
            <SwipeCard
              key={vehicle.id}
              vehicle={vehicle}
              isTop={index === visibleCards.length - 1}
              onApprove={handleApprove}
              onReject={handleReject}
              onPhotoClick={onPhotoClick}
              onDeletePhoto={onDeletePhoto}
              actionLoading={actionLoading}
              exitDir={exitDirection}
              onPublishDirect={onPublishDirect}
              onUpdateField={onUpdateField}
              publishingDirectId={publishingDirectId}
              onEditPhoto={onEditPhoto}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Counter */}
      <p className="text-sm text-muted-foreground">
        {vehicles.length} veiculo(s) pendente(s)
      </p>
    </div>
  );
}
