"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { RefreshCw, Users, Loader2, Radio, Target, Search, Plus, Trash2, ToggleLeft, ToggleRight, ChevronLeft, ChevronRight, Send, ShieldAlert, ShieldCheck } from "lucide-react";
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
  isCommunity?: boolean;
  isAnnounce?: boolean;
  ownerPhone?: string | null;
}

function getGroupType(g: Group): string {
  if (g.isAnnounce || g.groupId.endsWith("@newsletter")) return "canal";
  if (g.isCommunity) return "comunidade";
  if (g.groupId.endsWith("@broadcast")) return "lista";
  if (g.groupId.endsWith("@s.whatsapp.net")) return "contato";
  return "grupo";
}

function getGroupTypeIcon(type: string): string {
  switch (type) {
    case "canal": return "📡";
    case "comunidade": return "🏘️";
    case "lista": return "📢";
    case "contato": return "👤";
    default: return "👥";
  }
}

const REGIONS = ["SC", "RS", "PR", "SP", "Nacional"] as const;

const PAGE_SIZE = 50;

interface PaginatedResponse {
  groups: Group[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export default function GruposPage() {
  const [sourceData, setSourceData] = useState<PaginatedResponse | null>(null);
  const [targetData, setTargetData] = useState<PaginatedResponse | null>(null);
  const [sourcePage, setSourcePage] = useState(1);
  const [targetPage, setTargetPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("todos");
  const [mobileGroupTab, setMobileGroupTab] = useState<"SOURCE" | "TARGET">("TARGET");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    phone: "",
    name: "",
    role: "SOURCE" as "SOURCE" | "TARGET",
    kind: "individual" as "individual" | "broadcast",
  });
  const [adding, setAdding] = useState(false);

  // Debounce search input — avoid hitting server on every keystroke
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [search]);

  // Reset pagination when search/region changes
  useEffect(() => {
    setSourcePage(1);
    setTargetPage(1);
  }, [debouncedSearch, regionFilter]);

  const buildUrl = useCallback(
    (role: "SOURCE" | "TARGET", page: number) => {
      const params = new URLSearchParams({
        role,
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      // Region filter: server supports single region, so if multi-selected we apply client-side.
      // If exactly one region selected, push to server for efficiency.
      if (regionFilter.length === 1) params.set("region", regionFilter[0]);
      return `/api/groups?${params.toString()}`;
    },
    [debouncedSearch, regionFilter]
  );

  const fetchGroups = useCallback(async () => {
    try {
      const [sRes, tRes] = await Promise.all([
        fetch(buildUrl("SOURCE", sourcePage)),
        fetch(buildUrl("TARGET", targetPage)),
      ]);
      if (sRes.ok) setSourceData(await sRes.json());
      if (tRes.ok) setTargetData(await tRes.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [buildUrl, sourcePage, targetPage]);

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
    // Operates on the current page only — for full-list activation, fetch all roles unpaginated.
    // To keep this snappy and avoid loading every group, fetch a special unpaginated endpoint.
    let toUpdate: Group[] = [];
    try {
      const params = new URLSearchParams({ role, counts: "false" });
      const res = await fetch(`/api/groups?${params.toString()}`);
      if (res.ok) {
        const all: Group[] = await res.json();
        toUpdate = all.filter((g) => g.active !== active);
      }
    } catch {
      toast.error("Erro ao carregar grupos");
      return;
    }
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

  const [testingGroupId, setTestingGroupId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [membershipReport, setMembershipReport] = useState<{
    usingSeparateInstance: boolean;
    sendInstanceLabel: string;
    sendInstanceTotalGroups: number;
    totalTargetGroups: number;
    problemCount: number;
    groups: Array<{ id: string; groupId: string; name: string; region: string | null; problem: string | null; inSendInstance: boolean; isDM: boolean }>;
  } | null>(null);
  const [showMembershipModal, setShowMembershipModal] = useState(false);

  const handleVerifyMembership = async () => {
    setVerifying(true);
    try {
      const res = await fetch("/api/groups/verify-send-membership");
      if (res.ok) {
        const data = await res.json();
        setMembershipReport(data);
        setShowMembershipModal(true);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Erro ao verificar");
      }
    } catch (e) {
      toast.error(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setVerifying(false);
    }
  };

  const [repairing, setRepairing] = useState(false);
  const handleRepairNames = async () => {
    setRepairing(true);
    try {
      const res = await fetch("/api/groups/repair-names", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        if (data.repaired > 0) {
          toast.success(
            `${data.repaired} grupos reparados${data.stillBroken > 0 ? ` (${data.stillBroken} sem retorno da UAZAPI)` : ""}`,
            { duration: 8000 }
          );
          fetchGroups();
        } else if (data.total === 0) {
          toast.success("Todos os grupos ja tem nome correto");
        } else {
          toast.error(
            `Nenhum dos ${data.stillBroken} grupos quebrados retornou nome — UAZAPI nao expoe metadata pra esses (provavelmente o numero nao eh membro ou grupo foi deletado)`,
            { duration: 12000 }
          );
        }
      } else {
        toast.error(data.error || "Erro ao reparar nomes");
      }
    } catch (e) {
      toast.error(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRepairing(false);
    }
  };

  const handleTestSend = async (group: Group) => {
    setTestingGroupId(group.id);
    try {
      const res = await fetch(`/api/groups/${group.id}/test-send`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(`✓ ${group.name}: enviou em ${data.durationMs}ms`, { duration: 6000 });
      } else {
        toast.error(`✗ ${group.name}: ${data.error || "erro desconhecido"}`, { duration: 12000 });
      }
    } catch (e) {
      toast.error(`Erro de conexao: ${e instanceof Error ? e.message : String(e)}`, { duration: 8000 });
    } finally {
      setTestingGroupId(null);
    }
  };

  // Convert a "phone@broadcast" entry (incorrectly constructed) into a proper
  // individual DM (@s.whatsapp.net). Recreates the entry since groupId is unique.
  const handleConvertToDM = async (group: Group) => {
    const phone = group.groupId.replace(/@broadcast$/, "");
    if (!/^\d+$/.test(phone)) {
      toast.error("Esta entrada nao parece um numero de telefone");
      return;
    }
    const newJid = `${phone}@s.whatsapp.net`;
    try {
      const del = await fetch(`/api/groups/${group.id}`, { method: "DELETE" });
      if (!del.ok) throw new Error("delete failed");
      const create = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: newJid,
          name: group.name,
          role: group.role,
          active: group.active,
          region: group.region,
        }),
      });
      if (!create.ok) throw new Error("create failed");
      toast.success("JID corrigido para DM");
      fetchGroups();
    } catch {
      toast.error("Erro ao corrigir JID");
    }
  };

  const handleAddManual = async () => {
    const raw = addForm.phone.trim();
    // If user pasted a full JID, use it as-is
    const isJid =
      raw.endsWith("@broadcast") ||
      raw.endsWith("@g.us") ||
      raw.endsWith("@newsletter") ||
      raw.endsWith("@s.whatsapp.net");
    const phone = isJid ? raw : raw.replace(/\D/g, "");
    if (!phone || phone.length < 5 || !addForm.name.trim()) {
      toast.error("Preencha um número válido e nome");
      return;
    }
    // Plain phone digits → individual contact (@s.whatsapp.net), NOT @broadcast.
    // Constructing @broadcast from a phone is invalid: broadcast lists must be
    // real existing JIDs returned by WhatsApp.
    const groupId = isJid
      ? phone
      : addForm.kind === "broadcast"
        ? `${phone}@broadcast`
        : `${phone}@s.whatsapp.net`;
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
        setAddForm({ phone: "", name: "", role: "SOURCE", kind: "individual" });
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

  // Server already filtered by role + search + (single) region.
  // Client only applies multi-region (when 2+ selected) and type filter (computed from JID).
  const matchesClientFilters = (g: Group) => {
    if (regionFilter.length > 1 && !regionFilter.includes(g.region || "")) return false;
    if (typeFilter !== "todos" && getGroupType(g) !== typeFilter) return false;
    return true;
  };
  const sourceGroups = (sourceData?.groups || []).filter(matchesClientFilters);
  const targetGroups = (targetData?.groups || []).filter(matchesClientFilters);
  const totalLoaded = (sourceData?.pagination.total || 0) + (targetData?.pagination.total || 0);

  const PaginationBar = ({
    page,
    totalPages,
    total,
    onChange,
  }: {
    page: number;
    totalPages: number;
    total: number;
    onChange: (newPage: number) => void;
  }) => {
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/50">
        <span className="text-[11px] text-muted-foreground">
          {total} grupos · pag {page} de {totalPages}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => onChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };

  const renderGroupCard = (group: Group) => (
    <div
      key={group.id}
      className={cn(
        "glass rounded-xl p-3 sm:p-4 transition-all w-full",
        !group.active && "opacity-50"
      )}
      style={{ maxWidth: "100%", overflow: "hidden" }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: "6px", alignItems: "center" }}>
        <div style={{ overflow: "hidden", minWidth: 0 }}>
          <p style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "13px", fontWeight: 500 }}>
            <span style={{ marginRight: "6px" }}>{getGroupTypeIcon(getGroupType(group))}</span>
            {group.name}
          </p>
          <p style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "10px", opacity: 0.5 }}>{group.groupId}</p>
          {/^\d{8,15}@broadcast$/.test(group.groupId) && (
            <button
              onClick={(e) => { e.stopPropagation(); handleConvertToDM(group); }}
              className="text-[10px] text-cugini-orange hover:underline mt-0.5"
              title="Converter para DM (@s.whatsapp.net)"
            >
              Corrigir → DM
            </button>
          )}
        </div>
        <Badge
          variant="outline"
          className="cursor-pointer border-border hover:border-cugini-orange/30 text-[10px] shrink-0"
          onClick={() => handleToggle(group, "role")}
        >
          {group.role === "SOURCE" ? "Fonte" : "Destino"}
        </Badge>
        <Switch
          checked={group.active}
          onCheckedChange={() => handleToggle(group, "active")}
        />
        {group.role === "TARGET" && (
          <button
            onClick={() => handleTestSend(group)}
            disabled={testingGroupId === group.id}
            className="p-1 rounded text-muted-foreground/40 hover:text-cugini-orange hover:bg-cugini-orange/10 transition-colors disabled:opacity-40"
            title="Testar envio (manda mensagem curta pra esse destino)"
          >
            {testingGroupId === group.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        )}
        <button
          onClick={() => handleDelete(group)}
          className="p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
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
            variant="outline"
            onClick={handleVerifyMembership}
            disabled={verifying}
            className="gap-2 border-border"
            title="Verifica se a instancia de envio e membro de cada grupo destino"
          >
            {verifying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Verificar acesso
          </Button>
          <Button
            variant="outline"
            onClick={handleRepairNames}
            disabled={repairing}
            className="gap-2 border-border"
            title="Tenta resolver nomes de grupos que ficaram so com o JID"
          >
            {repairing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Reparar nomes
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

        {/* Modal de verificação de acesso da instância de envio */}
        <Dialog open={showMembershipModal} onOpenChange={setShowMembershipModal}>
          <DialogContent className="sm:max-w-2xl bg-card border-border max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Verificação de acesso · envio</DialogTitle>
            </DialogHeader>
            {membershipReport && (
              <div className="space-y-4 pt-2">
                <div className="rounded-lg border border-border p-3 text-xs space-y-1">
                  <p>
                    Instância de envio: <span className="font-mono text-cugini-orange">{membershipReport.sendInstanceLabel}</span>
                    {!membershipReport.usingSeparateInstance && <span className="text-muted-foreground"> (usando fallback de captura)</span>}
                  </p>
                  <p>
                    Grupos visíveis pra instância de envio: <span className="font-medium">{membershipReport.sendInstanceTotalGroups}</span>
                  </p>
                  <p>
                    Grupos destino cadastrados: <span className="font-medium">{membershipReport.totalTargetGroups}</span>
                  </p>
                  {membershipReport.problemCount > 0 ? (
                    <p className="text-destructive font-semibold flex items-center gap-1.5 pt-1">
                      <ShieldAlert className="h-4 w-4" />
                      {membershipReport.problemCount} grupo(s) onde a instância de envio NÃO é membro
                    </p>
                  ) : (
                    <p className="text-success font-semibold flex items-center gap-1.5 pt-1">
                      <ShieldCheck className="h-4 w-4" />
                      Tudo certo: instância de envio é membro de todos os destinos
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  {membershipReport.groups.map((g) => (
                    <div
                      key={g.id}
                      className={cn(
                        "rounded-lg border p-2.5 flex items-start gap-2",
                        g.problem ? "border-destructive/30 bg-destructive/5" : "border-border bg-card/50"
                      )}
                    >
                      {g.problem ? (
                        <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                      ) : (
                        <ShieldCheck className="h-4 w-4 text-success shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {g.name}
                          {g.region && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-cugini-orange">{g.region}</span>}
                          {g.isDM && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">DM</span>}
                        </p>
                        <p className="text-[10px] text-muted-foreground/60 truncate font-mono">{g.groupId}</p>
                        {g.problem && (
                          <p className="text-xs text-destructive mt-1">{g.problem}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {membershipReport.problemCount > 0 && (
                  <div className="rounded-lg border border-cugini-orange/30 bg-cugini-orange/5 p-3 text-xs space-y-2">
                    <p className="font-semibold text-cugini-orange">Como resolver:</p>
                    <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
                      <li>Pegue o número da instância de envio (geralmente o WhatsApp Y configurado em UAZAPI_SEND).</li>
                      <li>Adicione esse número como participante em cada grupo listado acima dentro do WhatsApp.</li>
                      <li>Após adicionar, clique em &quot;Sincronizar UAZAPI&quot; e depois em &quot;Verificar acesso&quot; novamente.</li>
                    </ol>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal adicionar número manual */}
        <Dialog open={showAddModal} onOpenChange={(open) => { setShowAddModal(open); if (!open) setAddForm({ phone: "", name: "", role: "SOURCE", kind: "individual" }); }}>
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
                  Ex: 5511999999999 → enviado direto pra esse número (DM).
                  Cole um JID completo (@g.us, @broadcast, @newsletter) pra usar como-está.
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Nome do grupo/lista</label>
                <Input
                  placeholder="Teste — meu número"
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  className="bg-background border-border"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Forma de envio</label>
                <div className="flex gap-2">
                  {(
                    [
                      { id: "individual", label: "Número direto", hint: "DM (s.whatsapp.net)" },
                      { id: "broadcast", label: "Lista transmissão", hint: "@broadcast" },
                    ] as const
                  ).map((k) => (
                    <button
                      key={k.id}
                      onClick={() => setAddForm((f) => ({ ...f, kind: k.id }))}
                      className={cn(
                        "flex-1 rounded-lg py-2 text-xs font-medium border transition-all",
                        addForm.kind === k.id
                          ? "bg-cugini-orange/10 text-cugini-orange border-cugini-orange/30"
                          : "bg-card text-muted-foreground border-border hover:border-white/20"
                      )}
                    >
                      <div>{k.label}</div>
                      <div className="text-[10px] opacity-60 mt-0.5">{k.hint}</div>
                    </button>
                  ))}
                </div>
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
        ) : totalLoaded === 0 ? (
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

          {/* Type filter */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {[
              { id: "todos", label: "Todos" },
              { id: "grupo", label: "👥 Grupos" },
              { id: "comunidade", label: "🏘️ Comunidades" },
              { id: "canal", label: "📡 Canais" },
              { id: "lista", label: "📢 Listas" },
              { id: "contato", label: "👤 Contatos" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTypeFilter(t.id)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium border transition-all",
                  typeFilter === t.id
                    ? "bg-cugini-orange/10 border-cugini-orange/30 text-cugini-orange"
                    : "bg-card/50 border-border text-muted-foreground hover:border-white/20"
                )}
              >
                {t.label}
              </button>
            ))}
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
              Destino ({targetData?.pagination.total ?? 0})
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
              Fonte ({sourceData?.pagination.total ?? 0})
            </button>
          </div>

          <div className="hidden lg:grid grid-cols-2 gap-6">
            {/* Source Groups */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-success" />
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Grupos Fonte ({sourceData?.pagination.total ?? 0})
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
                    Nenhum grupo fonte nesta pagina
                  </p>
                )}
              </div>
              {sourceData && (
                <PaginationBar
                  page={sourceData.pagination.page}
                  totalPages={sourceData.pagination.totalPages}
                  total={sourceData.pagination.total}
                  onChange={setSourcePage}
                />
              )}
            </div>

            {/* Target Groups */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-cugini-orange" />
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Grupos Destino ({targetData?.pagination.total ?? 0})
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
                    Nenhum grupo destino nesta pagina
                  </p>
                )}
              </div>
              {targetData && (
                <PaginationBar
                  page={targetData.pagination.page}
                  totalPages={targetData.pagination.totalPages}
                  total={targetData.pagination.total}
                  onChange={setTargetPage}
                />
              )}
            </div>
          </div>

          {/* Mobile/Tablet: show only selected tab */}
          <div className="lg:hidden">
            {(() => {
              const isSource = mobileGroupTab === "SOURCE";
              const groupList = isSource ? sourceGroups : targetGroups;
              const data = isSource ? sourceData : targetData;
              const setPage = isSource ? setSourcePage : setTargetPage;
              const role = isSource ? "SOURCE" : "TARGET";
              return (
                <>
                  <div className="flex items-center gap-2 mb-3 overflow-hidden">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {isSource ? <Radio className="h-4 w-4 text-success shrink-0" /> : <Target className="h-4 w-4 text-cugini-orange shrink-0" />}
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                        {isSource ? "Fonte" : "Destino"} ({data?.pagination.total ?? 0})
                      </h3>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => handleActivateAll(role, true)} className="flex items-center gap-1 rounded-md border border-border px-1.5 h-6 text-[10px] text-muted-foreground hover:text-success hover:border-success/30 transition-colors" title="Ativar todos">
                        <ToggleRight className="h-3 w-3" />
                        <span className="hidden sm:inline">Ativar</span>
                      </button>
                      <button onClick={() => handleActivateAll(role, false)} className="flex items-center gap-1 rounded-md border border-border px-1.5 h-6 text-[10px] text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors" title="Desativar todos">
                        <ToggleLeft className="h-3 w-3" />
                        <span className="hidden sm:inline">Desativar</span>
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-[calc(100vh-420px)] overflow-y-auto rounded-xl">
                    {groupList.map((group) => renderGroupCard(group))}
                    {groupList.length === 0 && (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        Nenhum grupo {isSource ? "fonte" : "destino"} nesta pagina
                      </p>
                    )}
                  </div>
                  {data && (
                    <PaginationBar
                      page={data.pagination.page}
                      totalPages={data.pagination.totalPages}
                      total={data.pagination.total}
                      onChange={setPage}
                    />
                  )}
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
