"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { RefreshCw, Users, Loader2, Radio, Target, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Group {
  id: string;
  groupId: string;
  name: string;
  role: string;
  active: boolean;
  filters: string | null;
}

export default function GruposPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");

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

  const searchLower = search.toLowerCase();
  const sourceGroups = groups.filter((g) => g.role === "SOURCE" && (!search || g.name.toLowerCase().includes(searchLower)));
  const targetGroups = groups.filter((g) => g.role === "TARGET" && (!search || g.name.toLowerCase().includes(searchLower)));

  return (
    <>
      <Header title="Grupos" subtitle="Gerencie grupos de monitoramento e publicacao" />

      <div className="p-6 space-y-6">
        <div className="flex justify-end">
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

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                {sourceGroups.map((group) => (
                  <div
                    key={group.id}
                    className={cn(
                      "glass rounded-xl p-4 flex items-center justify-between transition-all",
                      !group.active && "opacity-50"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{group.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{group.groupId}</p>
                    </div>
                    <div className="flex items-center gap-3 ml-3">
                      <Badge
                        variant="outline"
                        className="cursor-pointer border-border hover:border-cugini-orange/30"
                        onClick={() => handleToggle(group, "role")}
                      >
                        Fonte
                      </Badge>
                      <Switch
                        checked={group.active}
                        onCheckedChange={() => handleToggle(group, "active")}
                      />
                    </div>
                  </div>
                ))}
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
                {targetGroups.map((group) => (
                  <div
                    key={group.id}
                    className={cn(
                      "glass rounded-xl p-4 flex items-center justify-between transition-all",
                      !group.active && "opacity-50"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{group.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{group.groupId}</p>
                    </div>
                    <div className="flex items-center gap-3 ml-3">
                      <Badge
                        variant="outline"
                        className="cursor-pointer border-border hover:border-cugini-orange/30"
                        onClick={() => handleToggle(group, "role")}
                      >
                        Destino
                      </Badge>
                      <Switch
                        checked={group.active}
                        onCheckedChange={() => handleToggle(group, "active")}
                      />
                    </div>
                  </div>
                ))}
                {targetGroups.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Nenhum grupo destino configurado
                  </p>
                )}
              </div>
            </div>
          </div>
          </>
        )}
      </div>
    </>
  );
}
