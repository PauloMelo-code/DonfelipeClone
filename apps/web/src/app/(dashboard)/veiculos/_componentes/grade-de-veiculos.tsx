"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Car, CheckSquare, Eye, Loader2, Pencil, Send, Square, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatKm, formatPrice, parseArray, statusConfig, type Vehicle } from "./tipos";

// ---------------------------------------------------------------------------
// A grade de cards das abas Aprovados, Prontos, Publicados e Rejeitados.
//
// A aba Pendentes nao usa esta grade -- la a triagem e por swipe, um carro de
// cada vez. Aqui o operador ve varios ao mesmo tempo e age em cada um.
// ---------------------------------------------------------------------------

interface Props {
  veiculos: Vehicle[];
  abaAtiva: string;
  carregandoAcao: string | null;
  marcados: Set<string>;
  aoMarcar: (id: string) => void;
  aoEditar: (v: Vehicle) => void;
  aoReenviar: (v: Vehicle) => void;
  aoRejeitar: (id: string) => void;
  aoPreVisualizar: (v: Vehicle) => void;
}

export function GradeDeVeiculos({
  veiculos, abaAtiva, carregandoAcao, marcados,
  aoMarcar, aoEditar, aoReenviar, aoRejeitar, aoPreVisualizar,
}: Props) {
  return (
    <motion.div layout className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      <AnimatePresence>
        {veiculos.map((veiculo) => {
          const fotos = parseArray(veiculo.photos);
          const opcionais = parseArray(veiculo.features);
          const sc = statusConfig[veiculo.status] || statusConfig.PENDING;
          const ocupado = carregandoAcao === veiculo.id;
          const temMarca = veiculo.brand && !veiculo.model.toUpperCase().startsWith(veiculo.brand.toUpperCase());

          return (
            <motion.div
              key={veiculo.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass rounded-2xl overflow-hidden hover:glow-gold-sm transition-all duration-300"
            >
              <div className="relative h-40 sm:h-52 bg-card">
                {abaAtiva === "APPROVED" && (
                  <button
                    className="absolute top-2 left-2 z-10"
                    onClick={(e) => { e.stopPropagation(); aoMarcar(veiculo.id); }}
                  >
                    {marcados.has(veiculo.id)
                      ? <CheckSquare className="h-6 w-6 text-brand-gold drop-shadow" />
                      : <Square className="h-6 w-6 text-white/70 drop-shadow" />
                    }
                  </button>
                )}
                {fotos.length > 0 ? (
                  <img src={fotos[0]} alt={veiculo.model} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Car className="h-12 w-12 text-muted-foreground/20" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />
                <Badge className={cn("absolute top-3 right-3 border", sc.color)}>{sc.label}</Badge>
                <h3 className="absolute bottom-3 left-4 right-4 font-semibold text-white text-base drop-shadow-lg truncate">
                  {temMarca ? `${veiculo.brand} ` : ""}{veiculo.model}
                </h3>
              </div>

              <div className="p-5 space-y-3">
                <p className="text-sm text-muted-foreground">
                  {veiculo.year} &middot; {formatKm(veiculo.km)}
                  {veiculo.transmission && ` · ${veiculo.transmission}`}
                  {veiculo.fuel && ` · ${veiculo.fuel}`}
                </p>

                <div className="flex items-baseline justify-between">
                  <div>
                    {veiculo.fipePrice && (
                      <p className="text-xs text-muted-foreground">FIPE: {formatPrice(veiculo.fipePrice)}</p>
                    )}
                    <p className="text-xl font-bold text-brand-gold">
                      {formatPrice(veiculo.sellingPrice || veiculo.price)}
                    </p>
                  </div>
                  {veiculo.fuel === "HIBRIDO" && (
                    <Badge variant="outline" className="border-success/30 text-success text-xs">Hibrido</Badge>
                  )}
                </div>

                {opcionais.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {opcionais.slice(0, 4).map((f, i) => (
                      <span key={i} className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] text-muted-foreground">
                        {f}
                      </span>
                    ))}
                    {opcionais.length > 4 && (
                      <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] text-muted-foreground">
                        +{opcionais.length - 4}
                      </span>
                    )}
                  </div>
                )}

                {veiculo.status === "REJECTED" && veiculo.rejectionReason && (
                  <div className="flex items-start gap-2 rounded-lg bg-destructive/5 border border-destructive/10 p-2.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                    <p className="text-xs text-destructive/80 leading-relaxed">{veiculo.rejectionReason}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  {veiculo.status === "APPROVED" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => aoEditar(veiculo)}
                        disabled={ocupado}
                        className="flex-1 gap-1.5 gradient-gold text-black border-0"
                        title="Abrir modal pra editar, preparar ou publicar"
                      >
                        {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                        onClick={() => aoRejeitar(veiculo.id)}
                        disabled={ocupado}
                        title="Rejeitar"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  {veiculo.status === "PUBLISHED" && (
                    <Button
                      size="sm"
                      onClick={() => aoReenviar(veiculo)}
                      disabled={ocupado}
                      className="flex-1 gap-1.5 border-brand-gold/30 text-brand-gold hover:bg-brand-gold/10"
                      variant="outline"
                    >
                      {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Reenviar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-border"
                    onClick={() => aoPreVisualizar(veiculo)}
                    title="Preview WhatsApp"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
}
