"use client";

import { useSyncExternalStore } from "react";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";

/** Nada muda depois da primeira leitura: o navegador nao ganha WebAuthn no meio. */
const nuncaMuda = () => () => {};

/**
 * Este navegador trabalha com passkey?
 *
 * `useSyncExternalStore` e nao `useEffect` com `setState`: a resposta so existe
 * no navegador, e o servidor precisa renderizar algo. Ler no efeito e chamar
 * `setState` faria a tela pintar duas vezes; a terceira funcao daqui e a
 * resposta do servidor, o que mantem a hidratacao casando.
 */
export function useSuporteAPasskey(): boolean {
  return useSyncExternalStore(nuncaMuda, browserSupportsWebAuthn, () => false);
}
