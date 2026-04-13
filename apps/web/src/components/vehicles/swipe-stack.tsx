"use client";

import { useState, useCallback } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  AnimatePresence,
} from "framer-motion";
import { Check, X, Car, ZoomIn, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

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
  sourceGroup?: { name: string; groupId: string } | null;
}

interface SwipeStackProps {
  vehicles: SwipeVehicle[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onPhotoClick?: (vehicle: SwipeVehicle) => void;
  actionLoading: string | null;
}

function SwipeCard({
  vehicle,
  isTop,
  onApprove,
  onReject,
  onPhotoClick,
  actionLoading,
  exitDir,
}: {
  vehicle: SwipeVehicle;
  isTop: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onPhotoClick?: (vehicle: SwipeVehicle) => void;
  actionLoading: string | null;
  exitDir: "left" | "right" | null;
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
          <div className="absolute bottom-3 left-4 right-4">
            <h3 className="text-lg font-bold text-white drop-shadow-lg">
              {vehicle.brand && `${vehicle.brand} `}
              {vehicle.model}
            </h3>
          </div>
        </div>

        {/* Info */}
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{vehicle.year}</span>
            <span className="text-border">&bull;</span>
            <span>{formatKm(vehicle.km)}</span>
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

          {(vehicle.color || vehicle.location || vehicle.state) && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {vehicle.color && <span>Cor: {vehicle.color}</span>}
              {(vehicle.location || vehicle.state) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {vehicle.location}{vehicle.location && vehicle.state ? "/" : ""}{vehicle.state}
                </span>
              )}
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
                {formatPrice(vehicle.price)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {vehicle.fipePrice && vehicle.fipePrice > vehicle.price && (
                <span className="rounded-full bg-success/10 border border-success/30 px-2 py-0.5 text-xs text-success font-medium">
                  -{Math.round((1 - vehicle.price / vehicle.fipePrice) * 100)}% FIPE
                </span>
              )}
              {vehicle.fuel === "HIBRIDO" && (
                <span className="rounded-full border border-success/30 px-2 py-0.5 text-xs text-success">
                  Hibrido
                </span>
              )}
            </div>
          </div>

          {/* Raw description — WhatsApp style, capped height with scroll */}
          {vehicle.rawDescription && (
            <div
              className="rounded-xl px-3 py-2.5"
              style={{ background: "#005C4B" }}
            >
              <p className="text-[12px] text-[#E9EDEF] whitespace-pre-wrap leading-[18px]">
                {vehicle.rawDescription}
              </p>
            </div>
          )}

          {/* Buttons */}
          {isTop && (
            <div className="flex gap-3 pt-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReject(vehicle.id);
                }}
                disabled={actionLoading === vehicle.id}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3.5 min-h-[44px] border-2 border-destructive/30 text-destructive font-medium transition-all hover:bg-destructive/10 hover:border-destructive/50 active:scale-95"
              >
                <X className="h-5 w-5" />
                Rejeitar
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onApprove(vehicle.id);
                }}
                disabled={actionLoading === vehicle.id}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3.5 min-h-[44px] border-2 border-success/30 text-success font-medium transition-all hover:bg-success/10 hover:border-success/50 active:scale-95"
              >
                <Check className="h-5 w-5" />
                Aprovar
              </button>
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
  actionLoading,
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
              actionLoading={actionLoading}
              exitDir={exitDirection}
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
