"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { RefreshCw, Users, Loader2, Radio, Target, Search, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Group {
  id: string;
  groupId: string;
  name: string;
  role: string;
  active: boolean;
  filters: string | null;
  region: string | null;
}

const REGIONS = ["SC", "RS", "PR", "SP", "Nacional"] as const;

export default function GruposPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState<string[]>([]);
  const [mobileGroupTab, setMobileGroupTab] = useState<"SOURCE" | "TARGET">("TARGET");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ phone: "", name: "", role: "SOURCE" as "SOURCE" | "TARGET" });
  const [adding, setAdding] = useState(false);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/groups");
      if (res.ok) setGroups(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/groups/sync");
      if (res.ok) {
        const data = await res.json();
        toast.success(`${data.synced} grupos sincronizados`);
        fetchGroups();
      }
    } catch {
      toast.error("Erro ao sincronizar");
    } finally {
      setSyncing(false);
    }
  };

  const handleActivateAll = async (role: "SOURCE" | "TARGET", active: boolean) => {
    const toUpdate = groups.filter((g) => g.role === role && g.active !== active);
    if (toUpdate.length === 0) return;

    try {
      await Promise.all(
        toUpdate.map((g) =>
          fetch(`/api/groups/${g.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active }),
          })
        )
      );
      toast.success(`${toUpdate.length} grupos ${active ? "ativados" : "desativados"}`);
      fetchGroups();
    } catch {
      toast.error("Erro ao atualizar grupos");
    }
  };

  const handleDelete = async (group: Group) => {
    if (!confirm(`Remover "${group.name}"?`)) return;
    try {
      const res = await fetch(`/api/groups/${group.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Grupo removido");
        fetchGroups();
      } else {
        const err = await res.json();
        toast.error(err.error || "Erro ao remover");
      }
    } catch {
      toast.error("Erro de conexão");
    }
  };

  const handleRegion = async (group: Group, region: string) => {
    const newRegion = group.region === region ? null : region;
    try {
      const res = await fetch(`/api/groups/${group.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region: newRegion }),
      });
      if (res.ok) fetchGroups();
    } catch {
      toast.error("Erro ao atualizar região");
    }
  };

  const handleToggle = async (group: Group, field: "active" | "role") => {
    const body =
      field === "active"
        ? { active: !group.active }
        : { role: group.role === "SOURCE" ? "TARGET" : "SOURCE" };

    try {
      const res = await fetch(`/api/groups/${group.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) fetchGroups();
    } catch {
      toast.error("Erro ao atualizar grupo");
    }
  };

  const handleAddManual = async () => {
    const raw = addForm.phone.trim();
    // If user pasted a full JID, use it as-is
    const isJid = raw.endsWith("@broadcast") || raw.endsWith("@g.us") || raw.endsWith("@newsletter");
    const phone = isJid ? raw : raw.replace(/\D/g, "");
    if (!phone || phone.length < 5 || !addForm.name.trim()) {
      toast.error("Preencha um número válido e nome");
      return;
    }
    const groupId = isJid ? phone : `${phone}@broadcast`;
    setAdding(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, name: addForm.name.trim(), role: addForm.role, active: true }),
      });
      if (res.ok) {
        toast.success("Grupo adicionado!");
        setShowAddModal(false);
        setAddForm({ phone: "", name: "", role: "SOURCE" });
        fetchGroups();
      } else {
        const err = await res.json();
        toast.error(err.error || "Erro ao adicionar");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setAdding(false);
    }
  };

  const searchLower = search.toLowerCase();
  const matchesFilters = (g: Group) => {
    if (search && !g.name.toLowerCase().includes(searchLower)) return false;
    if (regionFilter.length > 0 && !regionFilter.includes(g.region || "")) return false;
    return true;
  };
  const sourceGroups = groups.filter((g) => g.role === "SOURCE" && matchesFilters(g));
  const targetGroups = groups.filter((g) => g.role === "TARGET" && matchesFilters(g));

  const renderGroupCard = (group: Group) => (
    <div
      key={group.id}
      className={cn(
        "glass rounded-xl p-3 sm:p-4 transition-all overflow-hidden",
        !group.active && "opacity-50"
      )}
    >
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate text-[13px] sm:text-base">{group.name}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{group.groupId}</p>
        </div>
        <Switch
          checked={group.active}
          onCheckedChange={() => handleToggle(group, "active")}
          className="shrink-0"
        />
        <button
          onClick={() => handleDelete(group)}
          className="p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
          title="Remover grupo"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {REGIONS.map((r) => (
          <button
            key={r}
            onClick={() => handleRegion(group, r)}
            className={cn(
              "rounded-md px-2 py-0.5 text-[11px] font-medium transition-all border",
              group.region === r
                ? "bg-cugini-orange/10 text-cugini-orange border-cugini-orange/30"
                : "bg-card/50 text-muted-foreground border-border hover:text-foreground hover:border-white/20"
            )}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <Header title="Grupos" subtitle="Gerencie grupos de monitoramento e publicacao" />

      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
          <Button
            variant="outline"
            onClick={() => setShowAddModal(true)}
            className="gap-2 border-border"
          >
            <Plus className="h-4 w-4" />
            Adicionar manual
          </Button>
          <Button
            onClick={handleSync}
            disabled={syncing}
            className="gap-2 gradient-orange text-white"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sincronizar UAZAPI
          </Button>
        </div>

        {/* Modal adicionar número manual */}
        <Dialog open={showAddModal} onOpenChange={(open) => { setShowAddModal(open); if (!open) setAddForm({ phone: "", name: "", role: "SOURCE" }); }}>
          <DialogContent className="sm:max-w-sm bg-card border-border">
            <DialogHeader>
              <DialogTitle>Adicionar número manualmente</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Número (somente dígitos)</label>
                <Input
                  placeholder="5511999999999"
                  value={addForm.phone}
                  onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
                  className="bg-background border-border"
                />
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  Ex: 5511999999999 → será salvo como ...@broadcast
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Nome do grupo/lista</label>
                <Input
                  placeholder="Lista Teste SP"
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  className="bg-background border-border"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Tipo</label>
                <div className="flex gap-2">
                  {(["SOURCE", "TARGET"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setAddForm((f) => ({ ...f, role: r }))}
                      className={cn(
                        "flex-1 rounded-lg py-2 text-sm font-medium border transition-all",
                        addForm.role === r
                          ? "bg-cugini-orange/10 text-cugini-orange border-cugini-orange/30"
                          : "bg-card text-muted-foreground border-border hover:border-white/20"
                      )}
                    >
                      {r === "SOURCE" ? "Fonte (captura)" : "Destino (publica)"}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                onClick={handleAddManual}
                disabled={adding}
                className="w-full gradient-orange text-white border-0"
              >
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-cugini-orange" />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Users className="mb-3 h-12 w-12 opacity-20" />
            <p className="text-sm">Nenhum grupo encontrado</p>
            <p className="text-xs mt-1">Clique em Sincronizar para importar grupos do WhatsApp</p>
          </div>
        ) : (
          <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar grupo por nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card border-border"
            />
          </div>

          {/* Region filter */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {REGIONS.map((r) => (
              <button
                key={r}
                onClick={() => setRegionFilter((prev) =>
                  prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
                )}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium border transition-all",
                  regionFilter.includes(r)
                    ? "bg-cugini-orange/10 border-cugini-orange/30 text-cugini-orange"
                    : "bg-card/50 border-border text-muted-foreground hover:border-white/20"
                )}
              >
                {r}
              </button>
            ))}
            {regionFilter.length > 0 && (
              <button
                onClick={() => setRegionFilter([])}
                className="shrink-0 rounded-lg px-3 py-1.5 text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Mobile: tab toggle for Fonte/Destino */}
          <div className="flex gap-0 rounded-xl border border-border overflow-hidden lg:hidden">
            <button
              onClick={() => setMobileGroupTab("TARGET")}
              className={cn(
                "flex-1 py-2.5 text-xs font-medium transition-all text-center",
                mobileGroupTab === "TARGET"
                  ? "bg-cugini-orange text-white"
                  : "bg-card/50 text-muted-foreground"
              )}
            >
              Destino ({targetGroups.length})
            </button>
            <button
              onClick={() => setMobileGroupTab("SOURCE")}
              className={cn(
                "flex-1 py-2.5 text-xs font-medium transition-all text-center",
                mobileGroupTab === "SOURCE"
                  ? "bg-cugini-orange text-white"
                  : "bg-card/50 text-muted-foreground"
              )}
            >
              Fonte ({sourceGroups.length})
            </button>
          </div>

          <div className="hidden lg:grid grid-cols-2 gap-6">
            {/* Source Groups */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-success" />
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Grupos Fonte ({sourceGroups.length})
                  </h3>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => handleActivateAll("SOURCE", true)}
                  >
                    Ativar todos
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => handleActivateAll("SOURCE", false)}
                  >
                    Desativar todos
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {sourceGroups.map((group) => renderGroupCard(group))}
                {sourceGroups.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Nenhum grupo fonte configurado
                  </p>
                )}
              </div>
            </div>

            {/* Target Groups */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-cugini-orange" />
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Grupos Destino ({targetGroups.length})
                  </h3>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => handleActivateAll("TARGET", true)}
                  >
                    Ativar todos
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => handleActivateAll("TARGET", false)}
                  >
                    Desativar todos
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {targetGroups.map((group) => renderGroupCard(group))}
                {targetGroups.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Nenhum grupo destino configurado
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Mobile/Tablet: show only selected tab */}
          <div className="lg:hidden">
            {(() => {
              const isSource = mobileGroupTab === "SOURCE";
              const groupList = isSource ? sourceGroups : targetGroups;
              const role = isSource ? "SOURCE" : "TARGET";
              return (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center gap-2 flex-1">
                      {isSource ? <Radio className="h-4 w-4 text-success" /> : <Target className="h-4 w-4 text-cugini-orange" />}
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        {isSource ? "Fonte" : "Destino"} ({groupList.length})
                      </h3>
                    </div>
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" className="text-[11px] h-7 px-2" onClick={() => handleActivateAll(role, true)}>Ativar</Button>
                      <Button variant="outline" size="sm" className="text-[11px] h-7 px-2" onClick={() => handleActivateAll(role, false)}>Desativar</Button>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-[calc(100vh-380px)] overflow-y-auto rounded-xl">
                    {groupList.map((group) => renderGroupCard(group))}
                    {groupList.length === 0 && (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        Nenhum grupo {isSource ? "fonte" : "destino"} configurado
                      </p>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
          </>
        )}
      </div>
    </>
  );
}
