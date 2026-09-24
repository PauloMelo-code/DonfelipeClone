"use client";

import { useRef, useState } from "react";
import { motion, useDragControls, useMotionValue, useTransform } from "framer-motion";
import { Check, Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { anuncioParaExibir } from "@/lib/vehicle-formatter";
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
//
// O arrasto so comeca fora da foto, do texto e dos botoes: nesses lugares
// arrastar edita. O framer escuta o pointerdown direto no elemento, antes do
// React, entao o filtro vive aqui, nao num stopPropagation dos filhos.
//
// O texto do anuncio se edita direto na caixa. O rascunho mora aqui porque
// Aprovar e Publicar precisam grava-lo antes de agir: o servidor le o texto
// do banco.
// ---------------------------------------------------------------------------

/** Onde arrastar nao decide o carro. */
const SEM_ARRASTO = "[data-sem-arrasto], textarea, input, button";

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
      onClick={aoClicar}
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
  onApprove, onReject, onPhotoClick, onSetMainPhoto, onPhotoEdited,
  actionLoading, onPublishDirect, onUpdateField, publishingDirectId,
}: CardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-18, 0, 18]);
  const opacidadeAprovar = useTransform(x, [0, 80, 200], [0, 0.6, 1]);
  const opacidadeRejeitar = useTransform(x, [-200, -80, 0], [1, 0.6, 0]);
  const arrasto = useDragControls();

  // null = o operador nao mexeu no texto.
  const [rascunho, setRascunho] = useState<string | null>(null);
  const [salvandoTexto, setSalvandoTexto] = useState(false);
  const gravacaoRef = useRef<Promise<boolean> | null>(null);

  const publicando = publishingDirectId === vehicle.id;
  // Gravar o texto NAO trava os botoes: clicar em Aprovar tira o foco da caixa,
  // e isso comeca a gravacao antes do clique chegar. O botao espera por ela.
  const bloqueado = actionLoading === vehicle.id || publicando;

  const gravarRascunho = async (): Promise<boolean> => {
    if (rascunho === null || !onUpdateField) return true;
    const texto = rascunho.trim();
    if (!texto || texto === (anuncioParaExibir(vehicle) ?? "").trim()) {
      setRascunho(null);
      return true;
    }
    setSalvandoTexto(true);
    try {
      await onUpdateField(vehicle.id, "formattedAd", texto);
      // Se o operador seguiu digitando durante a gravacao, o rascunho novo fica.
      setRascunho((atual) => (atual !== null && atual.trim() === texto ? null : atual));
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar o anúncio");
      return false;
    } finally {
      setSalvandoTexto(false);
    }
  };

  /** Sair da caixa e clicar num botao disparam juntos: uma gravacao so. */
  const salvarTexto = () => {
    gravacaoRef.current ??= gravarRascunho().finally(() => { gravacaoRef.current = null; });
    return gravacaoRef.current;
  };

  const depoisDeSalvar = async (acao: (id: string) => void) => {
    if (await salvarTexto()) acao(vehicle.id);
  };

  const aoSoltar = (_: unknown, info: { offset: { x: number } }) => {
    if (info.offset.x > DISTANCIA_DE_DECISAO) void depoisDeSalvar(onApprove);
    else if (info.offset.x < -DISTANCIA_DE_DECISAO) onReject(vehicle.id);
  };

  const iniciarArrasto = (e: React.PointerEvent) => {
    if ((e.target as Element).closest(SEM_ARRASTO)) return;
    arrasto.start(e);
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
      dragControls={arrasto}
      dragListener={false}
      onPointerDown={isTop ? iniciarArrasto : undefined}
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
              className="absolute inset-0 z-40 flex items-center justify-center rounded-2xl border-4 border-success bg-success/10 pointer-events-none"
              style={{ opacity: opacidadeAprovar }}
            >
              <div className="rounded-full bg-success/20 p-6">
                <Check className="h-16 w-16 text-success" strokeWidth={3} />
              </div>
            </motion.div>
            <motion.div
              className="absolute inset-0 z-40 flex items-center justify-center rounded-2xl border-4 border-destructive bg-destructive/10 pointer-events-none"
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
          aoAmpliar={onPhotoClick ? () => onPhotoClick(vehicle) : undefined}
          onSetMainPhoto={onSetMainPhoto}
          onPhotoEdited={onPhotoEdited}
        />

        <div className="p-4 flex flex-col gap-3">
          <DadosDoCard
            vehicle={vehicle}
            onUpdateField={isTop ? onUpdateField : undefined}
            edicaoDoTexto={isTop && onUpdateField ? {
              rascunho,
              mudar: setRascunho,
              sair: () => void salvarTexto(),
              salvando: salvandoTexto,
            } : undefined}
          />

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
                aoClicar={() => void depoisDeSalvar(onApprove)}
                bloqueado={bloqueado}
                className="border-2 border-border bg-card/50 text-foreground hover:border-white/30"
              >
                <Check className="h-4 w-4" />
                <span className="text-sm">Aprovar</span>
              </BotaoDeAcao>

              {onPublishDirect && (
                <BotaoDeAcao
                  aoClicar={() => void depoisDeSalvar(onPublishDirect)}
                  bloqueado={bloqueado}
                  className="bg-gradient-to-br from-success to-success/70 text-white font-semibold hover:shadow-[0_0_20px_rgba(52,211,153,0.4)]"
                >
                  {publicando || salvandoTexto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
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
