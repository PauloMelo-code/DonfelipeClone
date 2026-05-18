"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, Loader2, Smartphone, RefreshCw, WifiOff, Wifi, BarChart3, MapPin, Send, Trash2, Ban, Crown, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Settings {
  profit_margin_percent: string;
  min_profit_margin: string;
  served_states: string;
  delay_min_seconds: string;
  delay_max_seconds: string;
  filter_min_year: string;
  filter_min_price: string;
  blocklist_keywords: string;
  vip_keywords: string;
}

type WaState = "open" | "connecting" | "close" | "error" | "unknown" | "not_configured";

export default function ConfiguracoesPage() {
  const [settings, setSettings] = useState<Settings>({
    profit_margin_percent: "10",
    min_profit_margin: "9",
    served_states: "RS,SC,PR,SP",
    delay_min_seconds: "3",
    delay_max_seconds: "8",
    filter_min_year: "2018",
    filter_min_price: "30000",
    blocklist_keywords: "",
    vip_keywords: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // WhatsApp capture connection state
  const [waState, setWaState] = useState<WaState>("unknown");
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const [waStatusLoading, setWaStatusLoading] = useState(true);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  // WhatsApp send connection state
  const [waSendState, setWaSendState] = useState<WaState>("unknown");
  const [waSendPhone, setWaSendPhone] = useState<string | null>(null);
  const [waSendStatusLoading, setWaSendStatusLoading] = useState(true);
  const [sendQrCode, setSendQrCode] = useState<string | null>(null);
  const [sendQrLoading, setSendQrLoading] = useState(false);

  // Reset vehicles state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetPreview, setResetPreview] = useState<{
    keepFrom: string;
    wouldDelete: { vehicles: number; postHistory: number; auditLogs: number; mediaFiles: number };
    kept: { vehicles: number };
  } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");

  // Helper: parse response safely. Returns parsed JSON or a friendly error
  // when the server returned HTML (deploy in progress, 404, login redirect, etc).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parseJsonResponse = async (res: Response): Promise<{ ok: true; data: any } | { ok: false; error: string }> => {
    const text = await res.text();
    if (!text) {
      return { ok: false, error: `Resposta vazia (HTTP ${res.status})` };
    }
    if (text.trim().startsWith("<")) {
      return {
        ok: false,
        error:
          res.status === 404
            ? "Endpoint nao encontrado. O deploy talvez ainda nao tenha terminado — aguarde 1 minuto e tente de novo."
            : res.status === 401 || res.status === 403
              ? "Sessao expirou ou voce nao e admin. Faca logout e login de novo."
              : `Servidor retornou HTML em vez de JSON (HTTP ${res.status}). Provavelmente o deploy esta em progresso ou houve erro 500.`,
      };
    }
    try {
      return { ok: true, data: JSON.parse(text) };
    } catch {
      return { ok: false, error: `Resposta invalida do servidor: ${text.slice(0, 120)}` };
    }
  };

  const handleOpenReset = async () => {
    setResetting(true);
    setResetPreview(null);
    setResetConfirmText("");
    setShowResetModal(true);
    try {
      const res = await fetch("/api/admin/reset-vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      const parsed = await parseJsonResponse(res);
      if (!parsed.ok) {
        toast.error(parsed.error, { duration: 12000 });
        setShowResetModal(false);
        return;
      }
      if (res.ok) {
        setResetPreview(parsed.data);
      } else {
        toast.error(parsed.data.error || "Erro ao calcular preview");
        setShowResetModal(false);
      }
    } catch (e) {
      toast.error(`Erro de conexao: ${e instanceof Error ? e.message : String(e)}`);
      setShowResetModal(false);
    } finally {
      setResetting(false);
    }
  };

  const handleConfirmReset = async () => {
    if (resetConfirmText !== "RESETAR") {
      toast.error('Digite "RESETAR" para confirmar');
      return;
    }
    setResetting(true);
    try {
      const res = await fetch("/api/admin/reset-vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      });
      const parsed = await parseJsonResponse(res);
      if (!parsed.ok) {
        toast.error(parsed.error, { duration: 12000 });
        return;
      }
      if (res.ok) {
        toast.success(
          `${parsed.data.deleted.vehicles} veiculos apagados. ${parsed.data.kept.vehicles} mantidos.`,
          { duration: 8000 }
        );
        setShowResetModal(false);
      } else {
        toast.error(parsed.data.error || "Erro ao resetar");
      }
    } catch (e) {
      toast.error(`Erro de conexao: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setResetting(false);
    }
  };

  const fetchWaStatus = useCallback(async () => {
    setWaStatusLoading(true);
    try {
      const res = await fetch("/api/whatsapp/status");
      if (res.ok) {
        const data = await res.json();
        setWaState((data.state ?? "unknown") as WaState);
        setWaPhone(data.phone ?? null);
        if (data.state === "open") setQrCode(null);
      } else {
        setWaState("error");
      }
    } catch {
      setWaState("error");
    } finally {
      setWaStatusLoading(false);
    }
  }, []);

  const fetchQR = async () => {
    setQrLoading(true);
    setQrCode(null);
    try {
      const res = await fetch("/api/whatsapp/qr");
      if (res.ok) {
        const data = await res.json();
        setQrCode(data.qrcode ?? null);
      } else {
        toast.error("Erro ao buscar QR code");
      }
    } catch {
      toast.error("Erro de conexao");
    } finally {
      setQrLoading(false);
    }
  };

  const fetchWaSendStatus = useCallback(async () => {
    setWaSendStatusLoading(true);
    try {
      const res = await fetch("/api/whatsapp/send-status");
      if (res.ok) {
        const data = await res.json();
        setWaSendState((data.state ?? "unknown") as WaState);
        setWaSendPhone(data.phone ?? null);
        if (data.state === "open") setSendQrCode(null);
      } else {
        setWaSendState("error");
      }
    } catch {
      setWaSendState("error");
    } finally {
      setWaSendStatusLoading(false);
    }
  }, []);

  const fetchSendQR = async () => {
    setSendQrLoading(true);
    setSendQrCode(null);
    try {
      const res = await fetch("/api/whatsapp/send-qr");
      if (res.ok) {
        const data = await res.json();
        setSendQrCode(data.qrcode ?? null);
      } else {
        toast.error("Erro ao buscar QR code de envio");
      }
    } catch {
      toast.error("Erro de conexao");
    } finally {
      setSendQrLoading(false);
    }
  };

  useEffect(() => {
    fetchWaStatus();
    fetchWaSendStatus();
  }, [fetchWaStatus, fetchWaSendStatus]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings((prev) => ({ ...prev, ...data }));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Only send the whitelisted keys
      const allowedKeys: (keyof Settings)[] = [
        "profit_margin_percent", "min_profit_margin", "served_states",
        "delay_min_seconds", "delay_max_seconds",
        "filter_min_year", "filter_min_price",
        "blocklist_keywords", "vip_keywords",
      ];
      const payload: Record<string, string> = {};
      for (const k of allowedKeys) {
        payload[k] = String(settings[k]);
      }
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Configuracoes salvas!");
      } else {
        const err = await res.json().catch(() => ({ error: "Erro ao salvar" }));
        toast.error(err.error || "Erro ao salvar");
      }
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const update = (key: keyof Settings, value: string) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const [backfilling, setBackfilling] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const handleBackfillFipe = async () => {
    setBackfilling(true);
    try {
      const res = await fetch("/api/vehicles/backfill-fipe", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message || `${data.updated} veículos atualizados`);
      } else {
        toast.error("Erro ao atualizar FIPE");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setBackfilling(false);
    }
  };

  const handleAutoRegion = async () => {
    setTagging(true);
    try {
      const res = await fetch("/api/groups/auto-region", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message || `${data.tagged} grupos taggeados`);
      } else {
        toast.error("Erro ao taguear");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setTagging(false);
    }
  };

  const handleCleanup = async (mode: string) => {
    const labels: Record<string, string> = {
      no_photo: "sem foto",
      bad_margin: "com margem ruim (preco >= FIPE)",
      all: "sem foto + margem ruim",
    };
    if (!confirm(`Remover veiculos ${labels[mode]}? Esta acao nao pode ser desfeita.`)) return;
    setCleaning(true);
    try {
      const res = await fetch(`/api/vehicles/cleanup?mode=${mode}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message || `${data.removed} veiculos removidos`);
      } else {
        toast.error("Erro ao limpar");
      }
    } catch {
      toast.error("Erro de conexao");
    } finally {
      setCleaning(false);
    }
  };

  const waStatusConfig: Record<WaState, { label: string; color: string; icon: React.ElementType }> = {
    open:       { label: "Conectado",    color: "text-success border-success/20 bg-success/10",         icon: Wifi },
    connecting: { label: "Conectando...",color: "text-warning border-warning/20 bg-warning/10",         icon: Loader2 },
    close:      { label: "Desconectado", color: "text-destructive border-destructive/20 bg-destructive/10", icon: WifiOff },
    error:      { label: "Erro",         color: "text-destructive border-destructive/20 bg-destructive/10", icon: WifiOff },
    unknown:        { label: "Verificando...",   color: "text-muted-foreground border-border bg-card",          icon: Loader2 },
    not_configured: { label: "Nao configurado", color: "text-muted-foreground border-border bg-card",          icon: WifiOff },
  };

  return (
    <>
      <Header title="Configuracoes" subtitle="Parametros do sistema" />

      <div className="p-6 max-w-2xl space-y-6">
        {/* WhatsApp Connection */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-cugini-orange" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Celular de Captura (WhatsApp)
            </h3>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              {waStatusLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (() => {
                const cfg = waStatusConfig[waState] ?? waStatusConfig.unknown;
                const Icon = cfg.icon;
                return (
                  <span className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", cfg.color)}>
                    <Icon className={cn("h-3 w-3", (waState === "connecting" || waState === "unknown") && "animate-spin")} />
                    {cfg.label}
                  </span>
                );
              })()}
              {waPhone && waState === "open" && (
                <span className="text-sm text-muted-foreground">{waPhone}</span>
              )}
            </div>
            <button
              onClick={fetchWaStatus}
              disabled={waStatusLoading}
              className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Atualizar status"
            >
              <RefreshCw className={cn("h-4 w-4", waStatusLoading && "animate-spin")} />
            </button>
          </div>

          {waState !== "open" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Para conectar, clique em &quot;Gerar QR Code&quot;, abra o WhatsApp no celular e escaneie o codigo.
              </p>
              <Button
                size="sm"
                onClick={fetchQR}
                disabled={qrLoading}
                className="gap-2 gradient-orange text-white border-0"
              >
                {qrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                Gerar QR Code
              </Button>

              {qrCode && (
                <div className="flex flex-col items-center gap-3 pt-2">
                  <div className="rounded-xl bg-white p-3 shadow-lg">
                    {qrCode.startsWith("data:image") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={qrCode} alt="QR Code WhatsApp" className="w-36 sm:w-48 h-36 sm:h-48" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`data:image/png;base64,${qrCode}`}
                        alt="QR Code WhatsApp"
                        className="w-36 sm:w-48 h-36 sm:h-48"
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Escaneie com o WhatsApp → Dispositivos conectados → Conectar dispositivo
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { fetchQR(); fetchWaStatus(); }}
                    className="gap-1.5 text-xs border-border"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Ja escaniei — verificar status
                  </Button>
                </div>
              )}
            </div>
          )}

          {waState === "open" && (
            <p className="text-xs text-muted-foreground">
              O celular esta conectado e monitorando os grupos de captura.
            </p>
          )}
        </div>

        {/* WhatsApp Send Connection */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-cugini-orange" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Celular de Envio (WhatsApp)
            </h3>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              {waSendStatusLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (() => {
                const cfg = waStatusConfig[waSendState] ?? waStatusConfig.unknown;
                const Icon = cfg.icon;
                return (
                  <span className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", cfg.color)}>
                    <Icon className={cn("h-3 w-3", (waSendState === "connecting" || waSendState === "unknown") && "animate-spin")} />
                    {cfg.label}
                  </span>
                );
              })()}
              {waSendPhone && waSendState === "open" && (
                <span className="text-sm text-muted-foreground">{waSendPhone}</span>
              )}
            </div>
            <button
              onClick={fetchWaSendStatus}
              disabled={waSendStatusLoading}
              className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Atualizar status"
            >
              <RefreshCw className={cn("h-4 w-4", waSendStatusLoading && "animate-spin")} />
            </button>
          </div>

          {(waSendState === "not_configured" || (waSendState === "unknown" && !waSendStatusLoading)) && (
            <p className="text-xs text-muted-foreground">
              Adicione UAZAPI_SEND_BASE_URL e UAZAPI_SEND_TOKEN no .env para configurar o celular de envio.
            </p>
          )}

          {waSendState !== "open" && waSendState !== "not_configured" && !(waSendState === "unknown" && !waSendStatusLoading) && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Para conectar, clique em &quot;Gerar QR Code&quot;, abra o WhatsApp no celular e escaneie o codigo.
              </p>
              <Button
                size="sm"
                onClick={fetchSendQR}
                disabled={sendQrLoading}
                className="gap-2 gradient-orange text-white border-0"
              >
                {sendQrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Gerar QR Code
              </Button>

              {sendQrCode && (
                <div className="flex flex-col items-center gap-3 pt-2">
                  <div className="rounded-xl bg-white p-3 shadow-lg">
                    {sendQrCode.startsWith("data:image") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sendQrCode} alt="QR Code WhatsApp Envio" className="w-36 sm:w-48 h-36 sm:h-48" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`data:image/png;base64,${sendQrCode}`}
                        alt="QR Code WhatsApp Envio"
                        className="w-36 sm:w-48 h-36 sm:h-48"
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Escaneie com o WhatsApp → Dispositivos conectados → Conectar dispositivo
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { fetchSendQR(); fetchWaSendStatus(); }}
                    className="gap-1.5 text-xs border-border"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Ja escaniei — verificar status
                  </Button>
                </div>
              )}
            </div>
          )}

          {waSendState === "open" && (
            <p className="text-xs text-muted-foreground">
              O celular de envio esta conectado e publicando nos grupos de destino.
            </p>
          )}
        </div>

        {/* Margem de Lucro */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Margem de Lucro
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Margem padrão sobre o preço captado (%)</Label>
              <Input
                type="number"
                value={settings.profit_margin_percent}
                onChange={(e) => update("profit_margin_percent", e.target.value)}
                className="bg-card border-border"
              />
            </div>
            <div className="space-y-2">
              <Label>Margem mínima de lucro (%)</Label>
              <Input
                type="number"
                value={settings.min_profit_margin}
                onChange={(e) => update("min_profit_margin", e.target.value)}
                className="bg-card border-border"
              />
              <p className="text-[11px] text-muted-foreground/60">
                A IA nunca vende abaixo disso, mesmo no smart pricing. Padrão 9%.
              </p>
            </div>
          </div>
        </div>

        {/* Região atendida */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Região atendida
          </h3>
          <div className="space-y-2">
            <Label>Estados atendidos (separados por vírgula)</Label>
            <Input
              value={settings.served_states}
              onChange={(e) => update("served_states", e.target.value)}
              placeholder="RS,SC,PR,SP"
              className="bg-card border-border"
            />
            <p className="text-[11px] text-muted-foreground/60">
              Grupos marcados como &quot;Nacional&quot; só aceitam carros destes estados.
              Carros de fora são descartados automaticamente.
            </p>
          </div>
        </div>

        {/* Anti-Ban */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Anti-Ban (Delays)
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Delay minimo (segundos)</Label>
              <Input
                type="number"
                value={settings.delay_min_seconds}
                onChange={(e) => update("delay_min_seconds", e.target.value)}
                className="bg-card border-border"
              />
            </div>
            <div className="space-y-2">
              <Label>Delay maximo (segundos)</Label>
              <Input
                type="number"
                value={settings.delay_max_seconds}
                onChange={(e) => update("delay_max_seconds", e.target.value)}
                className="bg-card border-border"
              />
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Filtros Padrao
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Ano minimo</Label>
              <Input
                type="number"
                value={settings.filter_min_year}
                onChange={(e) => update("filter_min_year", e.target.value)}
                className="bg-card border-border"
              />
            </div>
            <div className="space-y-2">
              <Label>Preco minimo (R$)</Label>
              <Input
                type="number"
                value={settings.filter_min_price}
                onChange={(e) => update("filter_min_price", e.target.value)}
                className="bg-card border-border"
              />
            </div>
          </div>
        </div>

        {/* Blocklist + VIP */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-cugini-orange" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Palavras-chave
            </h3>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Ban className="h-3.5 w-3.5 text-destructive" />
              Blocklist (rejeicao automatica)
            </Label>
            <Textarea
              value={settings.blocklist_keywords}
              onChange={(e) => update("blocklist_keywords", e.target.value)}
              placeholder="leilão, sinistro, batido, enchente, recuperado"
              className="bg-card border-border min-h-[80px]"
            />
            <p className="text-xs text-muted-foreground">
              Separe por virgula. Veiculos com essas palavras serao rejeitados automaticamente.
            </p>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Crown className="h-3.5 w-3.5 text-warning" />
              VIP keywords (prioridade)
            </Label>
            <Textarea
              value={settings.vip_keywords}
              onChange={(e) => update("vip_keywords", e.target.value)}
              placeholder="Defender, Range Rover, M3, Porsche"
              className="bg-card border-border min-h-[80px]"
            />
            <p className="text-xs text-muted-foreground">
              Separe por virgula. Veiculos com essas palavras recebem prioridade.
            </p>
          </div>
        </div>

        {/* Ferramentas */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-cugini-orange" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Ferramentas
            </h3>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-medium">Atualizar FIPE + Anúncios</p>
              <p className="text-xs text-muted-foreground">Extrai FIPE e regenera anúncios aprovados no formato Cugini</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBackfillFipe}
              disabled={backfilling}
              className="gap-1.5 border-border"
            >
              {backfilling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {backfilling ? "Atualizando..." : "Executar"}
            </Button>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-medium">Auto-tagger de Região</p>
              <p className="text-xs text-muted-foreground">Detecta RS/SC/PR/SP pelo nome do grupo</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoRegion}
              disabled={tagging}
              className="gap-1.5 border-border"
            >
              {tagging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
              {tagging ? "Tagueando..." : "Executar"}
            </Button>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-medium">Limpar veiculos sem foto</p>
              <p className="text-xs text-muted-foreground">Remove veiculos com foto quebrada, expirada ou ausente</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCleanup("no_photo")}
              disabled={cleaning}
              className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              {cleaning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {cleaning ? "Limpando..." : "Executar"}
            </Button>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-medium">Limpar veiculos sem margem</p>
              <p className="text-xs text-muted-foreground">Remove pendentes onde preco &gt;= FIPE (margem negativa)</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCleanup("bad_margin")}
              disabled={cleaning}
              className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              {cleaning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {cleaning ? "Limpando..." : "Executar"}
            </Button>
          </div>

          {/* Telegram alerts info section */}
          <div className="space-y-2 pt-3 border-t border-border">
            <p className="text-sm font-medium">Alertas Telegram</p>
            <p className="text-xs text-muted-foreground">
              Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID nas variaveis de ambiente.
              Voce recebera alertas quando:
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
              <li>Carro VIP capturado</li>
              <li>Oportunidade com score &gt;= 8</li>
              <li>WhatsApp desconectado</li>
              <li>Erros criticos do sistema</li>
            </ul>
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-2 gradient-orange text-white"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Configuracoes
        </Button>

        {/* Zona perigosa */}
        <div className="glass rounded-xl p-5 space-y-3 border border-destructive/20 mt-8">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-semibold text-destructive">Zona perigosa</h3>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Resetar veiculos antigos</p>
            <p className="text-xs text-muted-foreground">
              Apaga todos os veiculos capturados ANTES de hoje (00:00). Mantem so os carros do dia.
              Tambem limpa historico de publicacoes, audit logs e media files orfaos relacionados.
              Acao irreversivel.
            </p>
            <Button
              variant="outline"
              onClick={handleOpenReset}
              disabled={resetting}
              className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Resetar veiculos antigos
            </Button>
          </div>
        </div>
      </div>

      {/* Modal de confirmacao do reset */}
      <Dialog open={showResetModal} onOpenChange={(open) => { if (!resetting) setShowResetModal(open); }}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Resetar veiculos antigos
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {!resetPreview ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-border p-3 text-xs space-y-1">
                  <p className="text-muted-foreground">
                    Apagando capturas ate <span className="font-mono">{new Date(resetPreview.keepFrom).toLocaleString("pt-BR")}</span>
                  </p>
                </div>

                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wide">Sera apagado</p>
                  <ul className="text-sm space-y-0.5 mt-2">
                    <li><span className="font-bold text-destructive">{resetPreview.wouldDelete.vehicles}</span> veiculos</li>
                    <li><span className="font-bold text-destructive">{resetPreview.wouldDelete.postHistory}</span> registros de publicacao</li>
                    <li><span className="font-bold text-destructive">{resetPreview.wouldDelete.auditLogs}</span> audit logs</li>
                    <li><span className="font-bold text-destructive">{resetPreview.wouldDelete.mediaFiles}</span> arquivos de media</li>
                  </ul>
                </div>

                <div className="rounded-lg border border-success/30 bg-success/5 p-3 space-y-1">
                  <p className="text-xs font-semibold text-success uppercase tracking-wide">Sera mantido</p>
                  <p className="text-sm">
                    <span className="font-bold text-success">{resetPreview.kept.vehicles}</span> veiculos (capturados hoje)
                  </p>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">
                    Pra confirmar, digite <span className="font-mono font-semibold text-destructive">RESETAR</span>:
                  </Label>
                  <Input
                    value={resetConfirmText}
                    onChange={(e) => setResetConfirmText(e.target.value)}
                    placeholder="RESETAR"
                    className="bg-background border-border"
                    disabled={resetting}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setShowResetModal(false)}
              disabled={resetting}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmReset}
              disabled={resetting || !resetPreview || resetConfirmText !== "RESETAR"}
              className="gap-2 bg-destructive text-white hover:bg-destructive/90 disabled:opacity-50"
            >
              {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Apagar definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
