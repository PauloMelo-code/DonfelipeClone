"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Loader2, Smartphone, RefreshCw, WifiOff, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Settings {
  profit_margin_percent: string;
  delay_min_seconds: string;
  delay_max_seconds: string;
  filter_min_year: string;
  filter_min_price: string;
}

type WaState = "open" | "connecting" | "close" | "error" | "unknown";

export default function ConfiguracoesPage() {
  const [settings, setSettings] = useState<Settings>({
    profit_margin_percent: "10",
    delay_min_seconds: "5",
    delay_max_seconds: "15",
    filter_min_year: "2018",
    filter_min_price: "30000",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // WhatsApp connection state
  const [waState, setWaState] = useState<WaState>("unknown");
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const [waStatusLoading, setWaStatusLoading] = useState(true);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

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

  useEffect(() => {
    fetchWaStatus();
  }, [fetchWaStatus]);

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
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        toast.success("Configuracoes salvas!");
      }
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const update = (key: keyof Settings, value: string) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const waStatusConfig: Record<WaState, { label: string; color: string; icon: React.ElementType }> = {
    open:       { label: "Conectado",    color: "text-success border-success/20 bg-success/10",         icon: Wifi },
    connecting: { label: "Conectando...",color: "text-warning border-warning/20 bg-warning/10",         icon: Loader2 },
    close:      { label: "Desconectado", color: "text-destructive border-destructive/20 bg-destructive/10", icon: WifiOff },
    error:      { label: "Erro",         color: "text-destructive border-destructive/20 bg-destructive/10", icon: WifiOff },
    unknown:    { label: "Verificando...",color: "text-muted-foreground border-border bg-card",          icon: Loader2 },
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

          <div className="flex items-center justify-between">
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
                      <img src={qrCode} alt="QR Code WhatsApp" className="w-48 h-48" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`data:image/png;base64,${qrCode}`}
                        alt="QR Code WhatsApp"
                        className="w-48 h-48"
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

        {/* Margem de Lucro */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Margem de Lucro
          </h3>
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label>Margem sobre o preco captado (%)</Label>
              <Input
                type="number"
                value={settings.profit_margin_percent}
                onChange={(e) => update("profit_margin_percent", e.target.value)}
                className="bg-card border-border"
              />
            </div>
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

        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-2 gradient-orange text-white"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Configuracoes
        </Button>
      </div>
    </>
  );
}
