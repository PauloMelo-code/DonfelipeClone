"use client";

import { motion, useMotionValue, useTransform } from "framer-motion";
import { Check, Loader2, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DadosDoCard } from "./dados-do-card";
import { FotoDoCard } from "./foto-do-card";
import { DISTANCIA_DE_DECISAO, type CardProps } from "./tipos";

// ---------------------------------------------------------------------------
// Um carro na pilha.
//
// So o card de cima aceita arrasto; o de baixo existe pra dar profundidade e
// nao recebe ponteiro nenhum. Arrastar alem do limite decide o carro, e o
// verde ou o vermelho vao aparecendo conforme o dedo anda -- o operador ve o
// que vai acontecer antes de soltar.
// ---------------------------------------------------------------------------

/** Os tres botoes do rodape compartilham a mesma regra de bloqueio. */
function BotaoDeAcao({
  aoClicar, bloqueado, className, children,
}: {
  aoClicar: () => void;
  bloqueado: boolean;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); aoClicar(); }}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={bloqueado}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-xl py-3 font-medium transition-all active:scale-95 min-h-[48px] disabled:opacity-50",
        className
      )}
    >
      {children}
    </button>
  );
}

export function SwipeCard({
  vehicle, isTop, exitDir,
  onApprove, onReject, onPhotoClick, onDeletePhoto, onSetMainPhoto,
  actionLoading, onPublishDirect, onUpdateField, publishingDirectId, onEditPhoto,
}: CardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-18, 0, 18]);
  const opacidadeAprovar = useTransform(x, [0, 80, 200], [0, 0.6, 1]);
  const opacidadeRejeitar = useTransform(x, [-200, -80, 0], [1, 0.6, 0]);

  const publicando = publishingDirectId === vehicle.id;
  const bloqueado = actionLoading === vehicle.id || publicando;

  const aoSoltar = (_: unknown, info: { offset: { x: number } }) => {
    if (info.offset.x > DISTANCIA_DE_DECISAO) onApprove(vehicle.id);
    else if (info.offset.x < -DISTANCIA_DE_DECISAO) onReject(vehicle.id);
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
      onDragEnd={isTop ? aoSoltar : undefined}
      initial={{ scale: isTop ? 1 : 0.95, opacity: isTop ? 1 : 0.6 }}
      animate={{ scale: isTop ? 1 : 0.95, opacity: isTop ? 1 : 0.6 }}
      exit={{ x: exitDir === "left" ? -300 : 300, opacity: 0, transition: { duration: 0.3 } }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <div className="rounded-2xl overflow-hidden flex flex-col bg-[#141414] border border-white/[0.06]">
        {/* O veredicto aparecendo conforme o dedo anda */}
        {isTop && (
          <>
            <motion.div
              className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-4 border-success bg-success/10 pointer-events-none"
              style={{ opacity: opacidadeAprovar }}
            >
              <div className="rounded-full bg-success/20 p-6">
                <Check className="h-16 w-16 text-success" strokeWidth={3} />
              </div>
            </motion.div>
            <motion.div
              className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-4 border-destructive bg-destructive/10 pointer-events-none"
              style={{ opacity: opacidadeRejeitar }}
            >
              <div className="rounded-full bg-destructive/20 p-6">
                <X className="h-16 w-16 text-destructive" strokeWidth={3} />
              </div>
            </motion.div>
          </>
        )}

        <FotoDoCard
          vehicle={vehicle}
          isTop={isTop}
          onPhotoClick={onPhotoClick}
          onDeletePhoto={onDeletePhoto}
          onSetMainPhoto={onSetMainPhoto}
          onEditPhoto={onEditPhoto}
        />

        <div className="p-4 flex flex-col gap-3">
          <DadosDoCard vehicle={vehicle} onUpdateField={onUpdateField} />

          {isTop && (
            <div className="grid grid-cols-3 gap-2 mt-auto pt-3">
              <BotaoDeAcao
                aoClicar={() => onReject(vehicle.id)}
                bloqueado={bloqueado}
                className="border-2 border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/50"
              >
                <X className="h-4 w-4" />
                <span className="text-sm">Rejeitar</span>
              </BotaoDeAcao>

              <BotaoDeAcao
                aoClicar={() => onApprove(vehicle.id)}
                bloqueado={bloqueado}
                className="border-2 border-border bg-card/50 text-foreground hover:border-white/30"
              >
                <Check className="h-4 w-4" />
                <span className="text-sm">Aprovar</span>
              </BotaoDeAcao>

              {onPublishDirect && (
                <BotaoDeAcao
                  aoClicar={() => onPublishDirect(vehicle.id)}
                  bloqueado={bloqueado}
                  className="bg-gradient-to-br from-success to-success/70 text-white font-semibold hover:shadow-[0_0_20px_rgba(52,211,153,0.4)]"
                >
                  {publicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  <span className="text-sm">Publicar</span>
                </BotaoDeAcao>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
