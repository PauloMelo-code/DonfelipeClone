"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, Loader2, Smartphone, RefreshCw, WifiOff, Wifi, BarChart3, MapPin, Send, Trash2, Ban, Crown, AlertTriangle, Filter, Percent } from "lucide-react";
import { PageContainer } from "@/components/ui/page-container";
import { SectionCard } from "@/components/ui/section-card";
import { AlertBanner } from "@/components/ui/alert-banner";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Settings {
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

type WaState = "open" | "connecting" | "close" | "error" | "unknown" | "not_configured";

export default function ConfiguracoesPage() {
  const [settings, setSettings] = useState<Settings>({
    profit_margin_percent: "10",
    min_fipe_discount: "10",
    served_states: "RS,SC,PR,SP",
    delay_min_seconds: "3",
    delay_max_seconds: "8",
    filter_min_year: "2018",
    filter_min_price: "30000",
    filter_max_km: "300000",
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
      toast.error("Erro de conexão");
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
      toast.error("Erro de conexão");
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
        "profit_margin_percent", "min_fipe_discount", "served_states",
        "delay_min_seconds", "delay_max_seconds",
        "filter_min_year", "filter_min_price", "filter_max_km",
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
        toast.success("Configurações salvas!");
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

  const [fixingNames, setFixingNames] = useState(false);
  const handleFixVehicleNames = async () => {
    setFixingNames(true);
    try {
      const dryRes = await fetch("/api/admin/fix-vehicle-names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      const dryData = await dryRes.json();
      if (!dryRes.ok) {
        toast.error(dryData.error || "Erro ao verificar");
        return;
      }
      if (dryData.fixed === 0) {
        toast.success(
          dryData.candidates > 0
            ? `${dryData.candidates} candidatos mas não foi possível re-extrair (texto original incompleto)`
            : "Nenhum modelo errado encontrado"
        );
        return;
      }
      const sampleStr = (dryData.samples || []).slice(0, 3)
        .map((s: { oldModel: string; newModel: string }) => `  ${s.oldModel} → ${s.newModel}`)
        .join("\n");
      if (!confirm(
        `${dryData.fixed} veículos terão o modelo corrigido.\n\n` +
        `Exemplos:\n${sampleStr}\n\n` +
        `Aplicar correção?`
      )) {
        return;
      }
      const fixRes = await fetch("/api/admin/fix-vehicle-names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      });
      const fixData = await fixRes.json();
      if (fixRes.ok) {
        toast.success(`${fixData.fixed} modelos corrigidos`, { duration: 8000 });
      } else {
        toast.error(fixData.error || "Erro ao aplicar");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro de conexão");
    } finally {
      setFixingNames(false);
    }
  };

  const [fixingPrices, setFixingPrices] = useState(false);
  const handleFixInflatedPrices = async () => {
    // 1. dry run
    setFixingPrices(true);
    try {
      const dryRes = await fetch("/api/admin/fix-inflated-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      const dryData = await dryRes.json();
      if (!dryRes.ok) {
        toast.error(dryData.error || "Erro ao verificar");
        return;
      }
      if (dryData.candidates === 0) {
        toast.success("Nenhum veículo com valor inflado");
        return;
      }
      // 2. confirma
      if (!confirm(
        `Encontrados ${dryData.candidates} veículos com valor inflado (> R$ 2.000.000).\n\n` +
        `Eles serão DIVIDIDOS POR 100 (corrige o bug do '78.200.00').\n\n` +
        `Exemplo: ${dryData.samples?.[0]?.model} R$ ${dryData.samples?.[0]?.old?.price?.toLocaleString("pt-BR")} → R$ ${dryData.samples?.[0]?.new?.price?.toLocaleString("pt-BR")}\n\n` +
        `Aplicar correção?`
      )) {
        return;
      }
      // 3. aplica
      const fixRes = await fetch("/api/admin/fix-inflated-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      });
      const fixData = await fixRes.json();
      if (fixRes.ok) {
        toast.success(`${fixData.fixed} veículos corrigidos`, { duration: 8000 });
      } else {
        toast.error(fixData.error || "Erro ao aplicar correção");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro de conexão");
    } finally {
      setFixingPrices(false);
    }
  };

  const handleCleanup = async (mode: string) => {
    const labels: Record<string, string> = {
      no_photo: "sem foto",
      bad_margin: "com margem ruim (preço >= FIPE)",
      all: "sem foto + margem ruim",
    };
    if (!confirm(`Remover veículos ${labels[mode]}? Esta ação não pode ser desfeita.`)) return;
    setCleaning(true);
    try {
      const res = await fetch(`/api/vehicles/cleanup?mode=${mode}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message || `${data.removed} veículos removidos`);
      } else {
        toast.error("Erro ao limpar");
      }
    } catch {
      toast.error("Erro de conexão");
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
    not_configured: { label: "Não configurado", color: "text-muted-foreground border-border bg-card",          icon: WifiOff },
  };

  return (
    <>
      <Header title="Configurações" subtitle="Parâmetros do sistema" />

      <PageContainer className="max-w-2xl">
        {/* WhatsApp Connection */}
        <SectionCard
          icon={<Smartphone />}
          title="Celular de Captura (WhatsApp)"
          padding="lg"
        >
        <div className="space-y-4">
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
                Para conectar, clique em &quot;Gerar QR Code&quot;, abra o WhatsApp no celular e escaneie o código.
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
                    Já escaneei — verificar status
                  </Button>
                </div>
              )}
            </div>
          )}

          {waState === "open" && (
            <p className="text-xs text-muted-foreground">
              O celular está conectado e monitorando os grupos de captura.
            </p>
          )}
        </div>
        </SectionCard>

        {/* WhatsApp Send Connection */}
        <SectionCard
          icon={<Send />}
          title="Celular de Envio (WhatsApp)"
          padding="lg"
        >
        <div className="space-y-4">
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
            <AlertBanner
              variant="info"
              icon={<AlertTriangle />}
              title="Instância de envio não configurada"
              description="Adicione UAZAPI_SEND_BASE_URL e UAZAPI_SEND_TOKEN no .env para ativar."
            />
          )}

          {waSendState !== "open" && waSendState !== "not_configured" && !(waSendState === "unknown" && !waSendStatusLoading) && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Para conectar, clique em &quot;Gerar QR Code&quot;, abra o WhatsApp no celular e escaneie o código.
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
                    Já escaneei — verificar status
                  </Button>
                </div>
              )}
            </div>
          )}

          {waSendState === "open" && (
            <p className="text-xs text-muted-foreground">
              O celular de envio está conectado e publicando nos grupos de destino.
            </p>
          )}
        </div>
        </SectionCard>

        {/* Margem de Lucro */}
        <SectionCard icon={<Percent />} title="Margem de Lucro" padding="lg">
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
              <Label>Desconto mínimo da FIPE (%)</Label>
              <Input
                type="number"
                value={settings.min_fipe_discount}
                onChange={(e) => update("min_fipe_discount", e.target.value)}
                className="bg-card border-border"
              />
              <p className="text-[11px] text-muted-foreground/60">
                Quanto o preço de compra precisa estar abaixo da tabela FIPE pra
                o carro valer a pena. Abaixo disso entra como &quot;sem margem&quot;. Padrão 10%.
              </p>
            </div>
          </div>
        </SectionCard>

        {/* Região atendida */}
        <SectionCard icon={<MapPin />} title="Região Atendida" padding="lg">
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
        </SectionCard>

        {/* Anti-Ban */}
        <SectionCard icon={<Wifi />} title="Anti-Ban (Delays)" padding="lg">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Delay mínimo (segundos)</Label>
              <Input
                type="number"
                value={settings.delay_min_seconds}
                onChange={(e) => update("delay_min_seconds", e.target.value)}
                className="bg-card border-border"
              />
            </div>
            <div className="space-y-2">
              <Label>Delay máximo (segundos)</Label>
              <Input
                type="number"
                value={settings.delay_max_seconds}
                onChange={(e) => update("delay_max_seconds", e.target.value)}
                className="bg-card border-border"
              />
            </div>
          </div>
        </SectionCard>

        {/* Filtros */}
        <SectionCard icon={<Filter />} title="Filtros Padrão" padding="lg">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Ano mínimo</Label>
              <Input
                type="number"
                value={settings.filter_min_year}
                onChange={(e) => update("filter_min_year", e.target.value)}
                className="bg-card border-border"
              />
            </div>
            <div className="space-y-2">
              <Label>Preço mínimo (R$)</Label>
              <Input
                type="number"
                value={settings.filter_min_price}
                onChange={(e) => update("filter_min_price", e.target.value)}
                className="bg-card border-border"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>KM máxima</Label>
              <Input
                type="number"
                value={settings.filter_max_km}
                onChange={(e) => update("filter_max_km", e.target.value)}
                placeholder="300000"
                className="bg-card border-border"
              />
              <p className="text-[11px] text-muted-foreground/60">
                Carros com km acima desse valor são descartados na captura.
                Padrão 300.000.
              </p>
            </div>
          </div>
        </SectionCard>

        {/* Blocklist + VIP */}
        <SectionCard icon={<Ban />} title="Palavras-chave" padding="lg">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Ban className="h-3.5 w-3.5 text-destructive" />
              Blocklist (rejeição automática)
            </Label>
            <Textarea
              value={settings.blocklist_keywords}
              onChange={(e) => update("blocklist_keywords", e.target.value)}
              placeholder="leilão, sinistro, batido, enchente, recuperado"
              className="bg-card border-border min-h-[80px]"
            />
            <p className="text-xs text-muted-foreground">
              Separe por vírgula. Veículos com essas palavras serão rejeitados automaticamente.
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
              Separe por vírgula. Veículos com essas palavras recebem prioridade.
            </p>
          </div>
        </div>
        </SectionCard>

        {/* Ferramentas */}
        <SectionCard icon={<BarChart3 />} title="Ferramentas" padding="lg">
        <div className="space-y-4">
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
              <p className="text-sm font-medium">Limpar veículos sem foto</p>
              <p className="text-xs text-muted-foreground">Remove veículos com foto quebrada, expirada ou ausente</p>
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
              <p className="text-sm font-medium">Limpar veículos sem margem</p>
              <p className="text-xs text-muted-foreground">Remove pendentes onde preço &gt;= FIPE (margem negativa)</p>
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

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-medium">Corrigir valores inflados</p>
              <p className="text-xs text-muted-foreground">
                Divide por 100 carros com preço/FIPE acima de R$ 2 mi (bug do &quot;78.200.00&quot;)
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleFixInflatedPrices}
              disabled={fixingPrices}
              className="gap-1.5 border-warning/40 text-warning hover:bg-warning/10"
            >
              {fixingPrices ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {fixingPrices ? "Verificando..." : "Executar"}
            </Button>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-medium">Corrigir modelos errados</p>
              <p className="text-xs text-muted-foreground">
                Detecta carros com modelo = chamada/loja (&quot;Menor valor Brasil&quot;,
                &quot;CAARPIX PORTO ALEGRE&quot;) e re-extrai do anúncio original
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleFixVehicleNames}
              disabled={fixingNames}
              className="gap-1.5 border-cugini-orange/30 text-cugini-orange hover:bg-cugini-orange/10"
            >
              {fixingNames ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {fixingNames ? "Verificando..." : "Executar"}
            </Button>
          </div>

        </div>
        </SectionCard>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-2 gradient-orange text-white"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Configurações
        </Button>
      </PageContainer>
    </>
  );
}
