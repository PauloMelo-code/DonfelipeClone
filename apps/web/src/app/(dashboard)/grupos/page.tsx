"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { RefreshCw, Users, Loader2, Radio, Target } from "lucide-react";
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

  const sourceGroups = groups.filter((g) => g.role === "SOURCE");
  const targetGroups = groups.filter((g) => g.role === "TARGET");

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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Source Groups */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Radio className="h-4 w-4 text-success" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Grupos Fonte ({sourceGroups.length})
                </h3>
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
              <div className="mb-3 flex items-center gap-2">
                <Target className="h-4 w-4 text-cugini-orange" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Grupos Destino ({targetGroups.length})
                </h3>
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
        )}
      </div>
    </>
  );
}
