"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Car, Check, CheckSquare, Clock, Eye, Loader2, MapPin, Pencil, Send, Square, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { anuncioParaExibir, tituloDoAnuncio } from "@/lib/vehicle-formatter";
import { lerEstado, lerOrigem } from "@/components/vehicles/swipe-stack/origem";
import { Selos } from "@/components/vehicles/swipe-stack/selo-de-margem";
import { horaDaCaptura, quandoChegou } from "@/components/vehicles/swipe-stack/tipos";
import { formatKm, formatPrice, parseArray, statusConfig, type Vehicle } from "./tipos";

// ---------------------------------------------------------------------------
// A grade de cards das abas Aprovados, Prontos, Publicados e Rejeitados -- e
// dos Pendentes, quando o operador escolhe ver em lista.
//
// A triagem por swipe mostra um carro de cada vez, com o anuncio inteiro. E
// boa pra decidir com calma, mas o cliente quer ver TODAS as oportunidades de
// uma vez pra escolher em quais mexer (24/09/2026): repasse gira rapido, e o
// carro bom some enquanto ele analisa os da frente. Entao a mesma grade das
// outras abas serve os pendentes, com Aprovar, Publicar e Rejeitar em cada um.
//
// E o card conta o MESMO que o da pilha: de onde veio, quando foi capturado,
// a margem contra a FIPE, a margem do "Por:" e a nota. Sem isso o operador
// nao decide na lista -- teria que abrir carro por carro pra ver o que
// importa. So o texto do anuncio fica de fora, que ai a grade nao cabe na
// tela; pra ele ha o olho do Preview.
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
  /** So na aba Pendentes. */
  aoAprovar?: (id: string) => void;
  aoPublicarDireto?: (id: string) => void;
  publicandoId?: string | null;
}

export function GradeDeVeiculos({
  veiculos, abaAtiva, carregandoAcao, marcados,
  aoMarcar, aoEditar, aoReenviar, aoRejeitar, aoPreVisualizar,
  aoAprovar, aoPublicarDireto, publicandoId,
}: Props) {
  return (
    <motion.div layout className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      <AnimatePresence>
        {veiculos.map((veiculo) => {
          const fotos = parseArray(veiculo.photos);
          const opcionais = parseArray(veiculo.features);
          const sc = statusConfig[veiculo.status] || statusConfig.PENDING;
          const ocupado = carregandoAcao === veiculo.id;
          // O mesmo titulo da pilha e do anuncio que vai pro grupo: sem o ano,
          // a km e o cambio que vem colados no modelo. A marca continua na
          // frente, que numa lista de muitos carros ela ajuda a achar.
          const titulo = tituloDoAnuncio(veiculo);
          const temMarca = veiculo.brand && !titulo.toUpperCase().startsWith(veiculo.brand.toUpperCase());
          const estado = lerEstado(veiculo);
          const origem = veiculo.sourceGroup ? lerOrigem(veiculo.sourceGroup) : null;

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
                  {temMarca ? `${veiculo.brand} ` : ""}{titulo}
                </h3>
              </div>

              <div className="p-5 space-y-3">
                {(estado.uf || veiculo.capturedAt) && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground/80">
                    {estado.uf && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-brand-gold/15 border border-brand-gold/30 px-2 py-0.5 text-xs font-semibold text-brand-gold uppercase tracking-wide">
                        <MapPin className="h-3 w-3" /> {estado.uf}
                        {estado.veioDoGrupo && <span className="text-[10px] opacity-60 normal-case ml-0.5">(grupo)</span>}
                      </span>
                    )}
                    {veiculo.location && <span>{veiculo.location}</span>}
                    {veiculo.capturedAt && (
                      <span
                        className="inline-flex items-center gap-1.5"
                        title={`Capturado em ${horaDaCaptura(veiculo.capturedAt)}`}
                      >
                        <Clock className="h-3 w-3 shrink-0" />
                        Capturado {quandoChegou(veiculo.capturedAt)}
                      </span>
                    )}
                  </div>
                )}

                {origem && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
                    <origem.icone className="h-3 w-3 shrink-0" />
                    <span className="font-medium text-muted-foreground">{origem.rotulo}:</span>
                    <span className="truncate flex-1 text-foreground/70">{origem.nome}</span>
                  </div>
                )}

                <p className="text-sm text-muted-foreground">
                  {veiculo.year} &middot; {formatKm(veiculo.km)}
                  {veiculo.transmission && ` · ${veiculo.transmission}`}
                  {veiculo.fuel && ` · ${veiculo.fuel}`}
                  {veiculo.color && ` · ${veiculo.color}`}
                </p>

                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    {veiculo.fipePrice && (
                      <p className="text-xs text-muted-foreground">FIPE: {formatPrice(veiculo.fipePrice)}</p>
                    )}
                    {/* O selo "-X% FIPE" compara a COMPRA. Quando o numero grande
                        e o de venda, a compra tem que aparecer, senao o selo
                        contradiz o preco que esta na tela. */}
                    {veiculo.sellingPrice && veiculo.sellingPrice !== veiculo.price && (
                      <p className="text-xs text-muted-foreground">Compra: {formatPrice(veiculo.price)}</p>
                    )}
                    <p className="text-xl font-bold text-brand-gold">
                      {formatPrice(veiculo.sellingPrice || veiculo.price)}
                    </p>
                  </div>
                  <Selos vehicle={veiculo} texto={anuncioParaExibir(veiculo)} />
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
                  {veiculo.status === "PENDING" && aoAprovar && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => aoAprovar(veiculo.id)}
                        disabled={ocupado}
                        className="flex-1 gap-1.5 gradient-gold text-black border-0"
                        title="Aprovar"
                      >
                        {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Aprovar
                      </Button>
                      {aoPublicarDireto && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 border-brand-gold/30 text-brand-gold hover:bg-brand-gold/10"
                          onClick={() => aoPublicarDireto(veiculo.id)}
                          disabled={ocupado || publicandoId === veiculo.id}
                          title="Publicar direto nos grupos"
                        >
                          {publicandoId === veiculo.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Send className="h-3.5 w-3.5" />}
                        </Button>
                      )}
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
