"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Settings {
  profit_margin_percent: string;
  delay_min_seconds: string;
  delay_max_seconds: string;
  filter_min_year: string;
  filter_max_price: string;
}

export default function ConfiguracoesPage() {
  const [settings, setSettings] = useState<Settings>({
    profit_margin_percent: "10",
    delay_min_seconds: "30",
    delay_max_seconds: "120",
    filter_min_year: "2018",
    filter_max_price: "300000",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, string> = {};
        data.forEach((s: { key: string; value: string }) => {
          map[s.key] = s.value;
        });
        setSettings((prev) => ({ ...prev, ...map }));
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

  return (
    <>
      <Header title="Configuracoes" subtitle="Parametros do sistema" />

      <div className="p-6 max-w-2xl space-y-6">
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
              <Label>Preco maximo (R$)</Label>
              <Input
                type="number"
                value={settings.filter_max_price}
                onChange={(e) => update("filter_max_price", e.target.value)}
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
