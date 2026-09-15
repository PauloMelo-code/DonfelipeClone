import { Loader2, Wifi, WifiOff } from "lucide-react";

// ---------------------------------------------------------------------------
// O vocabulario da tela de configuracoes.
//
// Tudo que o operador ajusta aqui e guardado como texto na tabela de
// configuracoes, uma linha por chave. Por isso os campos sao `string` mesmo
// quando representam numero: quem converte e quem usa, na hora de usar.
// ---------------------------------------------------------------------------

export interface Settings {
  profit_margin_percent: string;
  min_fipe_discount: string;
  served_states: string;
  delay_min_seconds: string;
  delay_max_seconds: string;
  filter_min_year: string;
  filter_min_price: string;
  filter_max_km: string;
  blocklist_keywords: string;
  vip_keywords: string;
}

/**
 * As chaves que a tela tem direito de gravar.
 *
 * A lista existe pra o PUT nunca mandar campo que veio junto na resposta do
 * GET mas nao pertence a esta tela.
 */
export const CHAVES_GRAVAVEIS: (keyof Settings)[] = [
  "profit_margin_percent",
  "min_fipe_discount",
  "served_states",
  "delay_min_seconds",
  "delay_max_seconds",
  "filter_min_year",
  "filter_min_price",
  "filter_max_km",
  "blocklist_keywords",
  "vip_keywords",
];

export type WaState = "open" | "connecting" | "close" | "error" | "unknown" | "not_configured";

/** Como cada estado da conexao aparece na tela. */
export const ESTADO_DA_CONEXAO: Record<WaState, { label: string; color: string; icon: React.ElementType }> = {
  open:           { label: "Conectado",       color: "text-success border-success/20 bg-success/10",             icon: Wifi },
  connecting:     { label: "Conectando...",   color: "text-warning border-warning/20 bg-warning/10",             icon: Loader2 },
  close:          { label: "Desconectado",    color: "text-destructive border-destructive/20 bg-destructive/10", icon: WifiOff },
  error:          { label: "Erro",            color: "text-destructive border-destructive/20 bg-destructive/10", icon: WifiOff },
  // So aparece DEPOIS da consulta (durante ela o cartao mostra o spinner), entao
  // nao gira: "Verificando..." aqui parecia travado.
  unknown:        { label: "Sem status",      color: "text-muted-foreground border-border bg-card",              icon: WifiOff },
  not_configured: { label: "Não configurado", color: "text-muted-foreground border-border bg-card",              icon: WifiOff },
};

/** Os estados em que o icone gira. */
export const ESTADOS_EM_MOVIMENTO: WaState[] = ["connecting"];
