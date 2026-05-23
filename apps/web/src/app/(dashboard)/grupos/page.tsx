"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { RefreshCw, Users, Loader2, Radio, Target, Search, Plus, Trash2, ToggleLeft, ToggleRight, ChevronLeft, ChevronRight, ChevronDown, Send, ShieldAlert, ShieldCheck, Pencil, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Group {
  id: string;
  groupId: string;
  name: string;
  nameLocked?: boolean;
  role: string;
  active: boolean;
  filters: string | null;
  region: string | null;
  isCommunity?: boolean;
  isAnnounce?: boolean;
  isContact?: boolean;
  kindOverride?: string | null;
  ownerPhone?: string | null;
}

function getGroupType(g: Group): string {
  // kindOverride manual tem prioridade sobre classificacao automatica.
  // Permite mover um contato pra "lista" (ou qualquer combinacao) sem
  // mexer no JID real.
  if (g.kindOverride) return g.kindOverride;
  // Classificacao automatica por sufixo do JID:
  //   @newsletter -> canal (canal OFICIAL do WhatsApp)
  //   @broadcast  -> lista de transmissao
  //   @s.whatsapp.net -> contato (DM 1-1)
  //   @g.us + isCommunity -> comunidade
  //   @g.us (resto) -> grupo (mesmo announce-only e GRUPO restrito, nao canal)
  if (g.isContact || g.groupId.endsWith("@s.whatsapp.net")) return "contato";
  if (g.groupId.endsWith("@newsletter")) return "canal";
  if (g.groupId.endsWith("@broadcast")) return "lista";
  if (g.isCommunity) return "comunidade";
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

const PAGE_SIZE = 20;

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

  // Contagens por tipo (vindas de /api/groups/stats), uma por role
  type TypeStats = { todos: number; grupo: number; canal: number; comunidade: number; lista: number; contato: number };
  const [sourceStats, setSourceStats] = useState<TypeStats | null>(null);
  const [targetStats, setTargetStats] = useState<TypeStats | null>(null);

  // Debounce search input — avoid hitting server on every keystroke
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [search]);

  // Reset pagination when search/region/type changes
  useEffect(() => {
    setSourcePage(1);
    setTargetPage(1);
  }, [debouncedSearch, regionFilter, typeFilter]);

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
      // Type filter: enviado pro server pra paginacao funcionar (canais/listas
      // sao detectados via JID + flags isAnnounce/isCommunity/isContact).
      if (typeFilter !== "todos") params.set("type", typeFilter);
      return `/api/groups?${params.toString()}`;
    },
    [debouncedSearch, regionFilter, typeFilter]
  );

  // Stats: contagem por tipo pra mostrar nas pills.
  // Refresh quando: termina de carregar grupos, ou apos sync/mutation.
  const fetchStats = useCallback(async () => {
    try {
      const [sRes, tRes] = await Promise.all([
        fetch("/api/groups/stats?role=SOURCE"),
        fetch("/api/groups/stats?role=TARGET"),
      ]);
      if (sRes.ok) setSourceStats(await sRes.json());
      if (tRes.ok) setTargetStats(await tRes.json());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // One-shot cleanup retroativo: desmarca isAnnounce em grupos @g.us que
  // foram erroneamente classificados como canal em syncs antigos.
  // Roda 1x por sessao, silencioso. Sem efeito se ja estiver tudo correto.
  useEffect(() => {
    const KEY = "groups-classification-fixed-v1";
    if (typeof window === "undefined" || sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, "1");
    fetch("/api/groups/fix-classification", { method: "POST" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.fixed > 0) {
          toast.success(`${data.fixed} grupos reclassificados (Canal → Grupo)`);
          fetchGroups();
          fetchStats();
        }
      })
      .catch(() => { /* ignore */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchGroups = useCallback(async () => {
    try {
      const [sRes, tRes] = await Promise.all([
        fetch(buildUrl("SOURCE", sourcePage)),
        fetch(buildUrl("TARGET", targetPage)),
      ]);
      if (sRes.ok) setSourceData(await sRes.json());
      if (tRes.ok) setTargetData(await tRes.json());
      // Stats em paralelo -- atualiza contagens nas pills.
      fetchStats();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [buildUrl, sourcePage, targetPage, fetchStats]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const [showSyncModal, setShowSyncModal] = useState(false);
  const runSync = async (instance: "capture" | "send" | "both") => {
    setSyncing(true);
    setShowSyncModal(false);
    try {
      const res = await fetch(`/api/groups/sync?instance=${instance}`);
      if (res.ok) {
        const data = await res.json();
        const labels: Record<string, string> = {
          capture: "fonte (captura)",
          send: "destino (envio)",
          both: "ambas instâncias",
        };
        toast.success(`${data.synced} grupos sincronizados de ${labels[instance]}`);
        fetchGroups();
      } else {
        toast.error("Erro ao sincronizar");
      }
    } catch {
      toast.error("Erro ao sincronizar");
    } finally {
      setSyncing(false);
    }
  };
  // Compat: handleSync abre o modal de escolha em vez de sincronizar direto
  const handleSync = () => setShowSyncModal(true);

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

  // Renomear grupo manualmente
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // Menu de reclassificacao -- usa Portal pra escapar do overflow:hidden do card.
  const [kindMenu, setKindMenu] = useState<{ id: string; x: number; y: number; group: Group } | null>(null);

  // Aplica override manual de tipo. Passar null/"" remove o override
  // (volta a classificacao automatica por JID).
  const handleChangeKind = async (group: Group, kind: string | null) => {
    setKindMenu(null);
    try {
      const res = await fetch(`/api/groups/${group.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kindOverride: kind }),
      });
      if (res.ok) {
        toast.success(kind ? `Reclassificado como ${kind}` : "Tipo restaurado para automático");
        fetchGroups();
        fetchStats();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Erro ao reclassificar");
      }
    } catch {
      toast.error("Erro de conexão");
    }
  };

  const openKindMenu = (e: React.MouseEvent<HTMLButtonElement>, group: Group) => {
    e.stopPropagation();
    e.preventDefault();
    // Se ja esta aberto pro mesmo group, fecha
    if (kindMenu?.id === group.id) {
      setKindMenu(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setKindMenu({
      id: group.id,
      x: rect.left,
      y: rect.bottom + 4,
      group,
    });
  };

  // Fecha menu ao clicar fora ou apertar Escape.
  // setTimeout(0) evita capturar o mesmo click que abriu o menu.
  useEffect(() => {
    if (!kindMenu) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-kind-menu]")) return; // click dentro do menu
      setKindMenu(null);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setKindMenu(null);
    };
    const t = setTimeout(() => {
      document.addEventListener("click", close);
      document.addEventListener("keydown", onEsc);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onEsc);
    };
  }, [kindMenu]);
  const [renameValue, setRenameValue] = useState("");
  const [savingRename, setSavingRename] = useState(false);

  const startRename = (group: Group) => {
    setRenamingId(group.id);
    setRenameValue(group.name);
  };

  const handleSaveRename = async (group: Group) => {
    const newName = renameValue.trim();
    if (!newName || newName === group.name) {
      setRenamingId(null);
      return;
    }
    setSavingRename(true);
    try {
      const res = await fetch(`/api/groups/${group.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (res.ok) {
        toast.success("Nome salvo — não será sobrescrito ao sincronizar");
        setRenamingId(null);
        fetchGroups();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Erro ao renomear");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setSavingRename(false);
    }
  };
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

  const [cleaningOrphans, setCleaningOrphans] = useState(false);
  const handleCleanupOrphans = async (deleteOrphans: boolean) => {
    if (deleteOrphans && !confirm("Apagar permanentemente os grupos órfãos (onde nenhuma instância UAZAPI participa)?\n\nIsso também limpa o histórico de publicações desses grupos.")) {
      return;
    }
    setCleaningOrphans(true);
    try {
      const url = `/api/groups/cleanup-orphans${deleteOrphans ? "?delete=true" : ""}`;
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        if (data.orphans === 0) {
          toast.success("Nenhum grupo órfão encontrado");
        } else {
          toast.success(
            deleteOrphans
              ? `${data.affected} grupos órfãos removidos do banco`
              : `${data.affected} grupos órfãos desativados — clique novamente em modo apagar pra remover de vez`,
            { duration: 10000 }
          );
          fetchGroups();
        }
      } else {
        toast.error(data.error || "Erro ao limpar órfãos");
      }
    } catch (e) {
      toast.error(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCleaningOrphans(false);
    }
  };

  const [repairing, setRepairing] = useState(false);
  const handleRepairNames = async () => {
    setRepairing(true);
    try {
      // Chama ambos endpoints: repair-names (grupos @g.us via /group/info)
      // e resolve-names (contatos + listas via /chat/find).
      const [r1, r2] = await Promise.all([
        fetch("/api/groups/repair-names", { method: "POST" }).then((r) => r.json()).catch(() => null),
        fetch("/api/groups/resolve-names", { method: "POST" }).then((r) => r.json()).catch(() => null),
      ]);
      const groupRepaired = r1?.repaired || 0;
      const chatResolved = r2?.updated || 0;
      const totalFixed = groupRepaired + chatResolved;
      if (totalFixed > 0) {
        const parts: string[] = [];
        if (groupRepaired > 0) parts.push(`${groupRepaired} grupos`);
        if (chatResolved > 0) parts.push(`${chatResolved} contatos/listas`);
        toast.success(`${totalFixed} nomes resolvidos (${parts.join(" + ")})`, { duration: 6000 });
        fetchGroups();
      } else {
        toast.success("Todos os nomes já estão resolvidos");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro de conexão");
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
      toast.error(`Erro de conexão: ${e instanceof Error ? e.message : String(e)}`, { duration: 8000 });
    } finally {
      setTestingGroupId(null);
    }
  };

  // Convert a "phone@broadcast" entry (incorrectly constructed) into a proper
  // individual DM (@s.whatsapp.net). Recreates the entry since groupId is unique.
  const handleConvertToDM = async (group: Group) => {
    const phone = group.groupId.replace(/@broadcast$/, "");
    if (!/^\d+$/.test(phone)) {
      toast.error("Esta entrada não parece um número de telefone");
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

  // Server ja filtrou por role + search + region (single) + type.
  // Client so aplica multi-region quando 2+ selecionados.
  const matchesClientFilters = (g: Group) => {
    if (regionFilter.length > 1 && !regionFilter.includes(g.region || "")) return false;
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
          {total} grupos · pág {page} de {totalPages}
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
          {renamingId === group.id ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveRename(group);
                  if (e.key === "Escape") setRenamingId(null);
                }}
                disabled={savingRename}
                className="flex-1 min-w-0 bg-background border border-cugini-orange/40 rounded px-1.5 py-0.5 text-[13px] outline-none focus:border-cugini-orange"
              />
              <button
                onClick={() => handleSaveRename(group)}
                disabled={savingRename}
                className="p-1 rounded text-success hover:bg-success/10 shrink-0"
                title="Salvar"
              >
                {savingRename ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => setRenamingId(null)}
                className="p-1 rounded text-muted-foreground hover:bg-white/[0.05] shrink-0"
                title="Cancelar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <p style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "13px", fontWeight: 500 }} className="flex items-center gap-1.5 group/name">
              {/* Botao do tipo -- clicavel pra reclassificar. Menu via Portal. */}
              <button
                type="button"
                onClick={(e) => openKindMenu(e, group)}
                className={cn(
                  "relative inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[12px] transition-all cursor-pointer shrink-0",
                  "border-white/[0.08] bg-white/[0.03] hover:bg-cugini-orange/10 hover:border-cugini-orange/40",
                  (group.kindOverride || kindMenu?.id === group.id) && "border-cugini-orange/40 bg-cugini-orange/10"
                )}
                title={`Tipo: ${getGroupType(group)}${group.kindOverride ? " (manual)" : ""} — clique para mudar`}
              >
                <span>{getGroupTypeIcon(getGroupType(group))}</span>
                <ChevronDown className="h-2.5 w-2.5 text-muted-foreground/60" />
                {group.kindOverride && (
                  <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-cugini-orange shadow-[0_0_4px_rgba(232,115,26,0.6)]" title="Tipo definido manualmente" />
                )}
              </button>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{group.name}</span>
              {group.nameLocked && (
                <span title="Nome fixado manualmente" className="text-[9px] text-cugini-orange shrink-0">📌</span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); startRename(group); }}
                className="p-0.5 rounded text-muted-foreground/40 hover:text-cugini-orange shrink-0 opacity-0 group-hover/name:opacity-100 transition-opacity"
                title="Renomear grupo"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </p>
          )}
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
      <Header title="Grupos" subtitle="Gerencie grupos de monitoramento e publicação" />

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
            title="Verifica se a instância de envio é membro de cada grupo destino"
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
            title="Tenta resolver nomes de grupos que ficaram só com o JID"
          >
            {repairing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Reparar nomes
          </Button>
          <Button
            variant="outline"
            onClick={() => handleCleanupOrphans(false)}
            disabled={cleaningOrphans}
            className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
            title="Desativa grupos onde nenhuma instância UAZAPI participa mais. Click duplo (com confirmação) pra apagar."
            onDoubleClick={() => handleCleanupOrphans(true)}
          >
            {cleaningOrphans ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Limpar órfãos
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

        {/* Modal de escolha de instância no sync */}
        <Dialog open={showSyncModal} onOpenChange={setShowSyncModal}>
          <DialogContent className="sm:max-w-md bg-card border-border">
            <DialogHeader>
              <DialogTitle>Sincronizar UAZAPI</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <p className="text-xs text-muted-foreground">
                Escolha qual número WhatsApp sincronizar:
              </p>
              <button
                onClick={() => runSync("capture")}
                disabled={syncing}
                className="w-full text-left rounded-lg border border-border p-3 hover:border-cugini-orange/40 hover:bg-cugini-orange/5 transition-colors"
              >
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Radio className="h-4 w-4 text-success" />
                  Apenas FONTE (captura)
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Atualiza só os grupos do número que RECEBE os anúncios.
                </p>
              </button>
              <button
                onClick={() => runSync("send")}
                disabled={syncing}
                className="w-full text-left rounded-lg border border-border p-3 hover:border-cugini-orange/40 hover:bg-cugini-orange/5 transition-colors"
              >
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Target className="h-4 w-4 text-cugini-orange" />
                  Apenas DESTINO (envio)
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Atualiza só os grupos do número que PUBLICA os anúncios.
                </p>
              </button>
              <button
                onClick={() => runSync("both")}
                disabled={syncing}
                className="w-full text-left rounded-lg border-2 border-cugini-orange/50 bg-cugini-orange/5 p-3 hover:border-cugini-orange/70 transition-colors"
              >
                <p className="text-sm font-semibold flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-cugini-orange" />
                  Ambas (recomendado)
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Sincroniza fonte e destino de uma vez. Mais lento mas completo.
                </p>
              </button>
            </div>
          </DialogContent>
        </Dialog>

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

          {/* Type filter — mostra contagem combinada de Fonte + Destino */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {([
              { id: "todos", label: "Todos", key: "todos" as const },
              { id: "grupo", label: "👥 Grupos", key: "grupo" as const },
              { id: "comunidade", label: "🏘️ Comunidades", key: "comunidade" as const },
              { id: "canal", label: "📡 Canais", key: "canal" as const },
              { id: "lista", label: "📢 Listas", key: "lista" as const },
              { id: "contato", label: "👤 Contatos", key: "contato" as const },
            ]).map((t) => {
              const count = (sourceStats?.[t.key] ?? 0) + (targetStats?.[t.key] ?? 0);
              const active = typeFilter === t.id;
              const hasData = sourceStats !== null || targetStats !== null;
              return (
                <button
                  key={t.id}
                  onClick={() => setTypeFilter(t.id)}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-all",
                    active
                      ? "bg-cugini-orange/10 border-cugini-orange/30 text-cugini-orange"
                      : "bg-card/50 border-border text-muted-foreground hover:border-white/20 hover:text-foreground"
                  )}
                >
                  <span>{t.label}</span>
                  {hasData && (
                    <span
                      className={cn(
                        "tabular-nums text-[10px] font-semibold rounded-full px-1.5 min-w-[20px] text-center",
                        active
                          ? "bg-cugini-orange/20 text-cugini-orange"
                          : "bg-white/[0.05] text-muted-foreground/80"
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
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
                    Nenhum grupo fonte nesta página
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
                    Nenhum grupo destino nesta página
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
                        Nenhum grupo {isSource ? "fonte" : "destino"} nesta página
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

      {/* Portal: menu de reclassificacao. Fica fora do card pra escapar
          do overflow:hidden + zIndex sempre no topo. */}
      {kindMenu && typeof document !== "undefined" && createPortal(
        <div
          data-kind-menu
          style={{
            position: "fixed",
            left: kindMenu.x,
            top: kindMenu.y,
            zIndex: 100,
          }}
          className="min-w-[200px] rounded-lg border border-white/[0.08] bg-[#131316] shadow-[0_10px_40px_rgba(0,0,0,0.7)] py-1"
        >
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground/50 font-semibold border-b border-white/[0.04] mb-1">
            Reclassificar como
          </div>
          {[
            { id: "grupo", label: "👥 Grupo" },
            { id: "canal", label: "📡 Canal" },
            { id: "comunidade", label: "🏘️ Comunidade" },
            { id: "lista", label: "📢 Lista" },
            { id: "contato", label: "👤 Contato" },
          ].map((opt) => {
            const current = getGroupType(kindMenu.group);
            const isCurrent = current === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => handleChangeKind(kindMenu.group, opt.id)}
                className={cn(
                  "w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors",
                  isCurrent
                    ? "bg-cugini-orange/10 text-cugini-orange"
                    : "text-foreground hover:bg-white/[0.04]"
                )}
              >
                <span>{opt.label}</span>
                {isCurrent && <Check className="h-3 w-3" />}
              </button>
            );
          })}
          {kindMenu.group.kindOverride && (
            <>
              <div className="border-t border-white/[0.04] my-1" />
              <button
                onClick={() => handleChangeKind(kindMenu.group, null)}
                className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-white/[0.04] hover:text-foreground transition-colors"
              >
                ↩ Voltar automático
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
