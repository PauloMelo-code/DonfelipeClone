"use client";

import { useCallback, useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// Como o operador quer ver a aba Pendentes.
//
//   "cards" -- a pilha, um carro de cada vez, com o anuncio inteiro. E o
//              padrao, e a melhor forma de decidir com calma.
//   "lista" -- a mesma grade das outras abas, todos de uma vez. O cliente
//              pediu (24/09/2026) pra ver todas as oportunidades juntas:
//              repasse gira rapido e o carro bom some enquanto ele analisa
//              os da frente, um a um.
//
// A escolha fica no navegador. A leitura e por `useSyncExternalStore` e nao
// por efeito: assim o servidor e a hidratacao veem a pilha, e o que estiver
// guardado entra logo depois, sem tela piscando nem estado em cascata.
// ---------------------------------------------------------------------------

export type ModoDosPendentes = "cards" | "lista";

const CHAVE = "pendentes_modo";
const ouvintes = new Set<() => void>();

/** Vale quando o navegador nao deixa guardar (aba anonima, storage bloqueado). */
let emMemoria: ModoDosPendentes | null = null;

function ler(): ModoDosPendentes {
  if (emMemoria) return emMemoria;
  try {
    return localStorage.getItem(CHAVE) === "lista" ? "lista" : "cards";
  } catch {
    return "cards";
  }
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

export function useModoDosPendentes(): [ModoDosPendentes, (modo: ModoDosPendentes) => void] {
  const modo = useSyncExternalStore(assinar, ler, () => "cards" as const);

  const trocar = useCallback((novo: ModoDosPendentes) => {
    emMemoria = novo;
    try {
      localStorage.setItem(CHAVE, novo);
    } catch {
      // Sem armazenamento a escolha vale so nesta sessao -- melhor que nada.
    }
    for (const ouvinte of ouvintes) ouvinte();
  }, []);

  return [modo, trocar];
}
