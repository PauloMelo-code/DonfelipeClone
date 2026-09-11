"use client";

import { useEffect } from "react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Conserto dos carros legados, uma vez por sessao e em silencio.
//
// Sao dois defeitos antigos que ficaram gravados no banco antes das correcoes
// entrarem no pipeline de captura:
//
//   - modelo que na verdade e a chamada da loja ("Menor valor", "CAARPIX")
//   - preco inflado em 100x (78.200.00 no lugar de 78.200)
//
// As duas rotas sao idempotentes: rodar de novo em base ja limpa nao muda
// nada. O aviso na tela so aparece se algum registro foi mesmo corrigido.
// ---------------------------------------------------------------------------

export function useAutocorrecao(aoCorrigir: () => void) {
  useEffect(() => {
    const CHAVE = "vehicles-auto-fix-v1";
    if (typeof window === "undefined" || sessionStorage.getItem(CHAVE)) return;
    sessionStorage.setItem(CHAVE, "1");

    const chamar = (rota: string) =>
      fetch(rota, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

    (async () => {
      try {
        const [nomes, precos] = await Promise.all([
          chamar("/api/admin/fix-vehicle-names"),
          chamar("/api/admin/fix-inflated-prices"),
        ]);
        const partes: string[] = [];
        if (nomes?.fixed > 0) partes.push(`${nomes.fixed} modelos corrigidos`);
        if (precos?.fixed > 0) partes.push(`${precos.fixed} valores corrigidos`);
        if (partes.length > 0) {
          toast.success(`\u{1F916} ${partes.join(" · ")}`, { duration: 6000 });
          aoCorrigir();
        }
      } catch { /* silencioso */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
