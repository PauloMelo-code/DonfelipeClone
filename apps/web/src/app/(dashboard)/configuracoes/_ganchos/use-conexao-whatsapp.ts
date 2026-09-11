"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { WaState } from "../_componentes/tipos";

// ---------------------------------------------------------------------------
// A conexao de um celular WhatsApp: o estado dele e o QR code pra parear.
//
// O sistema usa dois numeros -- um recebe os anuncios dos grupos de repasse,
// outro publica. Sao a mesma mecanica em rotas diferentes, entao este gancho e
// chamado duas vezes com as rotas de cada um.
// ---------------------------------------------------------------------------

interface Rotas {
  /** Rota que devolve `{ state, phone }`. */
  status: string;
  /** Rota que devolve `{ qrcode }`. */
  qr: string;
  /** Aparece no aviso quando a busca do QR falha. */
  rotuloDoErro: string;
}

export function useConexaoWhatsApp({ status, qr, rotuloDoErro }: Rotas) {
  const [estado, setEstado] = useState<WaState>("unknown");
  const [telefone, setTelefone] = useState<string | null>(null);
  const [carregandoEstado, setCarregandoEstado] = useState(true);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [carregandoQr, setCarregandoQr] = useState(false);

  const conferirEstado = useCallback(async () => {
    setCarregandoEstado(true);
    try {
      const res = await fetch(status);
      if (res.ok) {
        const data = await res.json();
        setEstado((data.state ?? "unknown") as WaState);
        setTelefone(data.phone ?? null);
        // Conectou: o QR na tela nao vale mais nada.
        if (data.state === "open") setQrCode(null);
      } else {
        setEstado("error");
      }
    } catch {
      setEstado("error");
    } finally {
      setCarregandoEstado(false);
    }
  }, [status]);

  const gerarQr = useCallback(async () => {
    setCarregandoQr(true);
    setQrCode(null);
    try {
      const res = await fetch(qr);
      if (res.ok) {
        const data = await res.json();
        setQrCode(data.qrcode ?? null);
      } else {
        toast.error(rotuloDoErro);
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setCarregandoQr(false);
    }
  }, [qr, rotuloDoErro]);

  useEffect(() => { conferirEstado(); }, [conferirEstado]);

  return { estado, telefone, carregandoEstado, qrCode, carregandoQr, conferirEstado, gerarQr };
}

export type ConexaoWhatsApp = ReturnType<typeof useConexaoWhatsApp>;
