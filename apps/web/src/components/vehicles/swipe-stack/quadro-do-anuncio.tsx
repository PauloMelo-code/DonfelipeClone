"use client";

import { useState } from "react";
import { Eye, FileText, Loader2 } from "lucide-react";
import { anuncioParaExibir } from "@/lib/vehicle-formatter";
import type { SwipeVehicle } from "./tipos";

// ---------------------------------------------------------------------------
// O anuncio como vai para o grupo, ja editavel no proprio card.
//
// O cliente pediu sem botao de editar: a caixa ja chega pronta pra digitar, e
// o texto grava sozinho ao sair dela (e antes de Aprovar ou Publicar, quem
// cuida disso e o card). O que o operador grava fica marcado como editado:
// aprovar e publicar respeitam o texto e so atualizam a linha "Por:".
//
// Arrastar dentro da caixa seleciona texto, nao decide o carro -- o card ja
// ignora textarea ao comecar o arrasto.
// ---------------------------------------------------------------------------

/** O rascunho mora no card; a caixa so le e avisa. */
export interface EdicaoDoTexto {
  /** null = o operador nao mexeu. */
  rascunho: string | null;
  mudar: (texto: string) => void;
  sair: () => void;
  salvando: boolean;
}

interface Props {
  vehicle: SwipeVehicle;
  /** Sem isto o quadro so mostra o texto (card de baixo da pilha). */
  edicao?: EdicaoDoTexto;
}

const FUNDO = { background: "#005C4B", WebkitOverflowScrolling: "touch" } as const;
const TEXTO = "text-[12px] leading-[18px] text-[#E9EDEF]";

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

export function QuadroDoAnuncio({ vehicle, edicao }: Props) {
  const anuncio = anuncioParaExibir(vehicle);
  const [verOriginal, setVerOriginal] = useState(false);

  // Sem anuncio gerado ainda, a caixa parte do texto do vendedor.
  const base = anuncio ?? vehicle.rawDescription ?? "";
  if (!base && !edicao) return null;

  const podeComparar = !!anuncio && !!vehicle.rawDescription;
  const mostrandoOriginal = verOriginal && podeComparar;
  const valor = edicao?.rascunho ?? base;

  const rotulo = mostrandoOriginal
    ? "Texto original do vendedor"
    : anuncio ? "Anúncio como vai para o grupo" : "Texto original (anúncio sendo gerado)";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{rotulo}</span>
          {edicao?.salvando ? (
            <span className="flex shrink-0 items-center gap-1 text-brand-gold">
              <Loader2 className="h-3 w-3 animate-spin" /> salvando
            </span>
          ) : vehicle.adEditedAt && !mostrandoOriginal ? (
            <span className="shrink-0 text-brand-gold/80">· editado</span>
          ) : null}
        </span>
        {podeComparar && (
          <button
            type="button"
            onClick={() => setVerOriginal((v) => !v)}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            {mostrandoOriginal ? <FileText className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {mostrandoOriginal ? "Ver anúncio" : "Ver original"}
          </button>
        )}
      </div>

      {edicao && !mostrandoOriginal ? (
        <textarea
          value={valor}
          onChange={(e) => edicao.mudar(e.target.value)}
          onBlur={edicao.sair}
          rows={Math.min(14, Math.max(6, valor.split("\n").length + 1))}
          aria-label="Texto do anúncio"
          // Modelo e versao de carro nao estao no dicionario: sublinhado vermelho em tudo.
          spellCheck={false}
          className={`w-full resize-y rounded-xl px-3 py-2.5 outline-none ring-1 ring-transparent transition-shadow hover:ring-brand-gold/30 focus:ring-brand-gold ${TEXTO}`}
          style={FUNDO}
        />
      ) : (
        <div className="max-h-[30vh] overflow-y-auto rounded-xl px-3 py-2.5" style={FUNDO}>
          <p className={`whitespace-pre-wrap ${TEXTO}`}>
            <ComNegrito texto={mostrandoOriginal ? vehicle.rawDescription ?? "" : base} />
          </p>
        </div>
      )}
    </div>
  );
}
