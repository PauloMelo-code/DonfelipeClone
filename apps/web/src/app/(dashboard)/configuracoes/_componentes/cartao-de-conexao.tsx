"use client";

import type { ReactElement } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertBanner } from "@/components/ui/alert-banner";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";
import type { ConexaoWhatsApp } from "../_ganchos/use-conexao-whatsapp";
import { ESTADO_DA_CONEXAO, ESTADOS_EM_MOVIMENTO } from "./tipos";

// ---------------------------------------------------------------------------
// O cartao de um celular WhatsApp: estado da conexao e pareamento por QR.
//
// Serve os dois numeros do sistema, o que captura e o que publica. A diferenca
// entre eles nao e visual: so o de envio pode faltar no `.env`, e nesse caso
// mostrar "Gerar QR Code" seria enganoso -- nao ha instancia pra parear.
// ---------------------------------------------------------------------------

interface Props {
  icone: ReactElement;
  titulo: string;
  conexao: ConexaoWhatsApp;
  /** Frase mostrada quando o celular esta conectado. */
  textoConectado: string;
  /** Texto alternativo da imagem do QR. */
  altDoQr: string;
  /** Icone do botao de gerar QR, pra combinar com o do cartao. */
  iconeDoBotao: ReactElement;
  /**
   * Este celular pode nao estar configurado no `.env`. Liga o aviso e some
   * com o botao de QR nesse caso. Vale so pro numero de envio.
   */
  podeFaltarConfiguracao?: boolean;
}

export function CartaoDeConexao({
  icone, titulo, conexao, textoConectado, altDoQr, iconeDoBotao, podeFaltarConfiguracao,
}: Props) {
  const { estado, telefone, carregandoEstado, qrCode, carregandoQr, conferirEstado, gerarQr } = conexao;
  const cfg = ESTADO_DA_CONEXAO[estado] ?? ESTADO_DA_CONEXAO.unknown;
  const Icone = cfg.icon;

  // Sem instancia configurada nao ha o que parear.
  const semConfiguracao =
    !!podeFaltarConfiguracao &&
    (estado === "not_configured" || (estado === "unknown" && !carregandoEstado));
  const mostrarQr = estado !== "open" && !semConfiguracao;

  return (
    <SectionCard icon={icone} title={titulo} padding="lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            {carregandoEstado ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <span className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", cfg.color)}>
                <Icone className={cn("h-3 w-3", ESTADOS_EM_MOVIMENTO.includes(estado) && "animate-spin")} />
                {cfg.label}
              </span>
            )}
            {telefone && estado === "open" && (
              <span className="text-sm text-muted-foreground">{telefone}</span>
            )}
          </div>
          <button
            onClick={conferirEstado}
            disabled={carregandoEstado}
            className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Atualizar status"
          >
            <RefreshCw className={cn("h-4 w-4", carregandoEstado && "animate-spin")} />
          </button>
        </div>

        {semConfiguracao && (
          <AlertBanner
            variant="info"
            icon={<AlertTriangle />}
            title="Instância de envio não configurada"
            description="Adicione UAZAPI_SEND_BASE_URL e UAZAPI_SEND_TOKEN no .env para ativar."
          />
        )}

        {mostrarQr && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Para conectar, clique em &quot;Gerar QR Code&quot;, abra o WhatsApp no celular e escaneie o código.
            </p>
            <Button
              size="sm"
              onClick={gerarQr}
              disabled={carregandoQr}
              className="gap-2 gradient-gold text-black border-0"
            >
              {carregandoQr ? <Loader2 className="h-4 w-4 animate-spin" /> : iconeDoBotao}
              Gerar QR Code
            </Button>

            {qrCode && (
              <div className="flex flex-col items-center gap-3 pt-2">
                <div className="rounded-xl bg-white p-3 shadow-lg">
                  {/* A rota ora devolve o data URI pronto, ora so o base64. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrCode.startsWith("data:image") ? qrCode : `data:image/png;base64,${qrCode}`}
                    alt={altDoQr}
                    className="w-36 sm:w-48 h-36 sm:h-48"
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Escaneie com o WhatsApp → Dispositivos conectados → Conectar dispositivo
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { gerarQr(); conferirEstado(); }}
                  className="gap-1.5 text-xs border-border"
                >
                  <RefreshCw className="h-3 w-3" />
                  Já escaneei — verificar status
                </Button>
              </div>
            )}
          </div>
        )}

        {estado === "open" && <p className="text-xs text-muted-foreground">{textoConectado}</p>}
      </div>
    </SectionCard>
  );
}
