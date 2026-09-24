"use client";

import { useEffect, useState } from "react";
import { CRITERIOS_PADRAO, criteriosDoScore, type CriteriosDoScore } from "@/lib/quality-score";

// ---------------------------------------------------------------------------
// As referencias da nota, do jeito que a tela precisa.
//
// O card recalcula a nota com os dados que estao nele, entao precisa dos
// mesmos criterios que o servidor usa. A busca e UMA so para a tela inteira:
// a promessa fica guardada aqui e todos os cards esperam por ela.
// ---------------------------------------------------------------------------

let emMemoria: Promise<CriteriosDoScore> | null = null;

async function buscar(): Promise<CriteriosDoScore> {
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) return CRITERIOS_PADRAO;
    return criteriosDoScore(await res.json());
  } catch {
    return CRITERIOS_PADRAO;
  }
}

/** Esquece o que foi buscado -- a tela de Configuracoes chama depois de salvar. */
export function esquecerCriteriosDoScore() {
  emMemoria = null;
}

export function useCriteriosDoScore(): CriteriosDoScore {
  const [criterios, setCriterios] = useState<CriteriosDoScore>(CRITERIOS_PADRAO);

  useEffect(() => {
    emMemoria ??= buscar();
    let vivo = true;
    emMemoria.then((c) => {
      if (vivo) setCriterios(c);
    });
    return () => {
      vivo = false;
    };
  }, []);

  return criterios;
}
