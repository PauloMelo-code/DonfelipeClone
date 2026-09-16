"use client";

import { useState } from "react";
import { Check, Eye, FileText, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { anuncioParaExibir } from "@/lib/vehicle-formatter";
import type { SwipeVehicle } from "./tipos";

// ---------------------------------------------------------------------------
// O anuncio como vai para o grupo, editavel no proprio card.
//
// O operador revisa, ajusta o texto e publica sem abrir o modal. O que ele
// salva aqui fica marcado como editado: aprovar e publicar respeitam o texto
// e so atualizam a linha "Por:".
//
// Tudo aqui para o ponteiro: o card e arrastavel, e selecionar texto viraria
// um swipe.
// ---------------------------------------------------------------------------

interface Props {
  vehicle: SwipeVehicle;
  onSalvar?: (texto: string) => Promise<void>;
  onEditandoChange?: (editando: boolean) => void;
}

const FUNDO = { background: "#005C4B", WebkitOverflowScrolling: "touch" } as const;
const BOTAO =
  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50";

/** O negrito do WhatsApp (*assim*) aparece como negrito de verdade. */
function ComNegrito({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\*[^*\n]+\*)/g).map((parte, i) =>
        /^\*[^*\n]+\*$/.test(parte)
          ? <strong key={i} className="font-semibold text-white">{parte.slice(1, -1)}</strong>
          : <span key={i}>{parte}</span>
      )}
    </>
  );
}

export function QuadroDoAnuncio({ vehicle, onSalvar, onEditandoChange }: Props) {
  const anuncio = anuncioParaExibir(vehicle);
  const [verOriginal, setVerOriginal] = useState(false);
  const [rascunho, setRascunho] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const editando = rascunho !== null;
  const mudarEdicao = (texto: string | null) => {
    setRascunho(texto);
    onEditandoChange?.(texto !== null);
  };

  const salvar = async () => {
    if (!onSalvar || !rascunho?.trim()) return;
    setSalvando(true);
    try {
      await onSalvar(rascunho.trim());
      mudarEdicao(null);
      toast.success("Anúncio salvo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar o anúncio");
    } finally {
      setSalvando(false);
    }
  };

  const mostrandoOriginal = verOriginal || !anuncio;
  const mostrado = mostrandoOriginal ? vehicle.rawDescription : anuncio;
  if (!mostrado && !editando) return null;

  const rotulo = editando
    ? "Editando o anúncio"
    : mostrandoOriginal
      ? anuncio ? "Texto original do vendedor" : "Texto original (anúncio sendo gerado)"
      : "Anúncio como vai para o grupo";

  return (
    <div className="flex flex-col gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{rotulo}</span>
        {!editando && (
          <div className="flex shrink-0 items-center gap-1">
            {anuncio && vehicle.rawDescription && (
              <button
                type="button"
                onClick={() => setVerOriginal((v) => !v)}
                className={`${BOTAO} text-muted-foreground hover:text-foreground hover:bg-white/5`}
              >
                {verOriginal ? <FileText className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {verOriginal ? "Ver anúncio" : "Ver original"}
              </button>
            )}
            {onSalvar && (
              <button
                type="button"
                onClick={() => {
                  setVerOriginal(false);
                  mudarEdicao(anuncio ?? vehicle.rawDescription ?? "");
                }}
                className={`${BOTAO} bg-brand-gold/15 text-brand-gold hover:bg-brand-gold/25`}
              >
                <Pencil className="h-3 w-3" /> Editar texto
              </button>
            )}
          </div>
        )}
      </div>

      {editando ? (
        <>
          <textarea
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            rows={12}
            autoFocus
            aria-label="Texto do anúncio"
            className="w-full resize-y rounded-xl px-3 py-2.5 text-[12px] leading-[18px] text-[#E9EDEF] outline-none ring-1 ring-brand-gold/40 focus:ring-brand-gold"
            style={FUNDO}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => mudarEdicao(null)}
              disabled={salvando}
              className={`${BOTAO} border border-border text-muted-foreground hover:text-foreground`}
            >
              <X className="h-3 w-3" /> Cancelar
            </button>
            <button
              type="button"
              onClick={salvar}
              disabled={salvando || !rascunho?.trim()}
              className={`${BOTAO} bg-success/90 text-black hover:bg-success`}
            >
              {salvando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Salvar
            </button>
          </div>
        </>
      ) : (
        <div className="max-h-[30vh] overflow-y-auto rounded-xl px-3 py-2.5" style={FUNDO}>
          <p className="whitespace-pre-wrap text-[12px] leading-[18px] text-[#E9EDEF]">
            <ComNegrito texto={mostrado ?? ""} />
          </p>
        </div>
      )}
    </div>
  );
}
