"use client";

import { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SwipeStack } from "@/components/vehicles/swipe-stack";
import { PhotoEditor } from "@/components/vehicles/photo-editor";
import {
  Car,
  Search,
  Check,
  X,
  Send,
  Eye,
  Loader2,
  MessageCircle,
  Copy,
  Pencil,
  ImageIcon,
  Percent,
  Users,
  ArrowRight,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  CheckSquare,
  Square,
  Layers,
  ChevronDown,
  MapPin,
  Radio,
  Building2,
  Megaphone,
  User,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatVehicleAd } from "@/lib/vehicle-formatter";

interface WhatsAppGroup {
  id: string;
  groupId: string;
  name: string;
  role: string;
  active: boolean;
  region: string | null;
}

interface Vehicle {
  id: string;
  model: string;
  brand: string | null;
  year: number;
  yearModel: number | null;
  km: number;
  price: number;
  sellingPrice: number | null;
  fipePrice: number | null;
  transmission: string | null;
  fuel: string | null;
  color: string | null;
  features: string | string[];
  photos: string | string[];
  status: string;
  formattedAd: string | null;
  rejectionReason: string | null;
  rawDescription: string | null;
  internalNotes?: string | null;
  capturedAt: string;
  sourceGroupId: string | null;
  sourceGroup: { name: string; groupId: string; isCommunity?: boolean; isAnnounce?: boolean; ownerPhone?: string | null; region?: string | null } | null;
  state?: string | null;
  qualityScore?: number | null;
  isVip?: boolean;
  autoRejectedReason?: string | null;
  preparedAt?: string | null;
  preparedTargetGroupIds?: string | null;
}

const REJECTION_OPTIONS = [
  { id: "fora_padrao", label: "Não é o padrão de veículo que trabalhamos" },
  { id: "sem_margem", label: "Sem margem (mínimo 10% abaixo da FIPE)" },
  { id: "fora_sul", label: "Não está localizado no Sul do Brasil" },
  { id: "repetido", label: "Repetido, já apareceu antes" },
  { id: "km_alta", label: "Km alta com pouca margem" },
  { id: "modelo_mais_margem", label: "Esse modelo precisa de mais margem" },
  { id: "sem_foto", label: "Anúncio sem foto / foto errada" },
] as const;

const statusConfig: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Pendente", color: "bg-warning/10 text-warning border-warning/20" },
  APPROVED: { label: "Aprovado", color: "bg-success/10 text-success border-success/20" },
  REJECTED: { label: "Rejeitado", color: "bg-destructive/10 text-destructive border-destructive/20" },
  PUBLISHED: { label: "Publicado", color: "bg-cugini-orange/10 text-cugini-orange border-cugini-orange/20" },
};

function parseArray(val: string | string[]): string[] {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val || "[]"); } catch { return []; }
}

function WhatsAppBubble({ text, photo, photoCount }: { text: string; photo?: string; photoCount: number }) {
  return (
    <div
      className="p-4 min-h-[140px] sm:min-h-[200px]"
      style={{
        backgroundColor: "#0B141A",
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }}
    >
      <div className="max-w-[85%] ml-auto">
        <div className="bg-[#005C4B] rounded-lg overflow-hidden shadow-lg">
          {photo && (
            <div className="relative">
              <img src={photo} alt="" className="w-full h-36 sm:h-44 object-cover" />
              {photoCount > 1 && (
                <div className="absolute bottom-2 right-2 bg-black/60 rounded-full px-2 py-0.5 text-[10px] text-white">
                  1/{photoCount}
                </div>
              )}
            </div>
          )}
          <div className="px-2.5 py-1.5">
            <p className="text-[13.5px] text-[#E9EDEF] whitespace-pre-wrap leading-[19px]">{text}</p>
            <div className="flex items-center justify-end gap-1 mt-0.5 -mb-0.5">
              <span className="text-[10.5px] text-[#8696A0]">
                {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <svg viewBox="0 0 16 11" className="h-[11px] w-4 text-[#53BDEB]" fill="currentColor">
                <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.095a.463.463 0 0 0-.336-.153.457.457 0 0 0-.344.153l-.311.31a.445.445 0 0 0-.127.333c0 .137.042.247.127.332l2.762 2.876c.09.089.2.133.332.133a.457.457 0 0 0 .37-.178l6.833-8.43a.418.418 0 0 0 .102-.298.442.442 0 0 0-.127-.324l-.395-.371z" />
                <path d="M14.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-1.2-1.249-.406.5 1.2 1.249c.09.089.2.133.332.133a.457.457 0 0 0 .37-.178l6.833-8.43a.418.418 0 0 0 .102-.298.442.442 0 0 0-.127-.324l-.395-.371z" style={{opacity: 0.75}} />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Wrapper exporta a pagina dentro de <Suspense> -- requerido pelo Next.js
// quando algum filho usa useSearchParams() (CSR bailout durante prerender).
export default function VeiculosPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-cugini-orange" /></div>}>
      <VeiculosPageInner />
    </Suspense>
  );
}

function VeiculosPageInner() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("PENDING");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [previewVehicle, setPreviewVehicle] = useState<Vehicle | null>(null);
  const [publishVehicle, setPublishVehicle] = useState<Vehicle | null>(null);
  const [republishMode, setRepublishMode] = useState(false);
  const [editedAd, setEditedAd] = useState("");
  const [publishTab, setPublishTab] = useState<"photo" | "edit" | "preview">("edit");
  const [mobileEditorFullscreen, setMobileEditorFullscreen] = useState(false);
  const [editedPhotos, setEditedPhotos] = useState<Record<number, string>>({});
  const [previewMode, setPreviewMode] = useState<"before" | "after">("after");
  const [rejectVehicleId, setRejectVehicleId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionTags, setRejectionTags] = useState<string[]>([]);
  const [publishingDirectId, setPublishingDirectId] = useState<string | null>(null);
  const [quickPublishVehicle, setQuickPublishVehicle] = useState<Vehicle | null>(null);
  const [quickPublishGroups, setQuickPublishGroups] = useState<string[]>([]);
  const [galleryVehicle, setGalleryVehicle] = useState<Vehicle | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [margin, setMargin] = useState(10);
  const [targetGroups, setTargetGroups] = useState<WhatsAppGroup[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const [batchPublishing, setBatchPublishing] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<{
    states: string[];
    priceRange: string;
    transmission: string;
  }>({ states: [], priceRange: "", transmission: "" });

  // Pre-populate state filter from URL query param (?state=SC)
  // Util pra navegacao vinda do dashboard (clique em "SC" no card "Capturas por estado")
  const searchParams = useSearchParams();
  useEffect(() => {
    const stateParam = searchParams.get("state");
    if (stateParam) {
      const upper = stateParam.toUpperCase();
      setFilters((f) => f.states.includes(upper) ? f : { ...f, states: [...f.states, upper] });
    }
    // run once on mount based on current URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const PAGE_SIZE = 20;

  const groupsByRegion = useMemo(() => {
    const map = new Map<string, WhatsAppGroup[]>();
    for (const g of targetGroups) {
      const r = g.region || "Outros";
      if (!map.has(r)) map.set(r, []);
      map.get(r)!.push(g);
    }
    return map;
  }, [targetGroups]);

  const toggleRegion = (region: string) => {
    const regionGroups = groupsByRegion.get(region) || [];
    const regionIds = regionGroups.map(g => g.groupId);
    const allSelected = regionIds.every(id => selectedGroupIds.includes(id));
    if (allSelected) {
      setSelectedGroupIds(prev => prev.filter(id => !regionIds.includes(id)));
    } else {
      setSelectedGroupIds(prev => [...new Set([...prev, ...regionIds])]);
    }
  };

  const toggleRegionById = (region: string) => {
    const regionGroups = groupsByRegion.get(region) || [];
    const regionIds = regionGroups.map(g => g.id);
    const allSelected = regionIds.every(id => selectedGroupIds.includes(id));
    if (allSelected) {
      setSelectedGroupIds(prev => prev.filter(id => !regionIds.includes(id)));
    } else {
      setSelectedGroupIds(prev => [...new Set([...prev, ...regionIds])]);
    }
  };

  const fetchVehicles = useCallback(async () => {
    try {
      // "PREPARED" eh uma aba virtual: status=APPROVED + prepared=true
      // Aba APPROVED real exclui os preparados (prepared=false)
      let url = `/api/vehicles?status=${activeTab}&page=${page}&limit=${PAGE_SIZE}`;
      if (activeTab === "PREPARED") {
        url = `/api/vehicles?status=APPROVED&prepared=true&page=${page}&limit=${PAGE_SIZE}`;
      } else if (activeTab === "APPROVED") {
        url = `/api/vehicles?status=APPROVED&prepared=false&page=${page}&limit=${PAGE_SIZE}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setVehicles(data.vehicles || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalCount(data.pagination?.total || 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeTab, page]);

  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  useEffect(() => {
    setLoading(true);
    setBatchSelected(new Set());
    fetchVehicles();
  }, [fetchVehicles]);

  // Auto-select region groups based on the vehicle's state OR source group region.
  // If neither is detected, leave ALL groups unmarked (user must opt in explicitly).
  useEffect(() => {
    if (!publishVehicle || targetGroups.length === 0) return;
    const effectiveRegion =
      publishVehicle.state ||
      publishVehicle.sourceGroup?.region ||
      null;

    // Restore "Enviar para" section open/closed preference from localStorage.
    // Default is collapsed so foto/preview fica em destaque na tela pequena.
    let sectionOpen = false;
    try {
      sectionOpen = localStorage.getItem("cugini_groups_section_open") === "1";
    } catch { /* storage unavailable */ }

    if (effectiveRegion) {
      const regionGroups = targetGroups.filter((g) => g.region === effectiveRegion);
      setSelectedGroupIds(regionGroups.map((g) => g.groupId));
      const next = new Set([effectiveRegion]);
      if (sectionOpen) next.add("__groups_section");
      setExpandedRegions(next);
    } else {
      setSelectedGroupIds([]);
      const next = new Set<string>();
      if (sectionOpen) next.add("__groups_section");
      setExpandedRegions(next);
    }
  }, [publishVehicle?.id, publishVehicle?.state, publishVehicle?.sourceGroup?.region, targetGroups]);

  const toggleBatchSelect = (id: string) => {
    setBatchSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllApproved = () => {
    const approvedIds = filtered.filter((v) => v.status === "APPROVED").map((v) => v.id);
    setBatchSelected((prev) =>
      prev.size === approvedIds.length ? new Set() : new Set(approvedIds)
    );
  };

  const handleBatchPublish = async () => {
    if (batchSelected.size === 0 || selectedGroupIds.length === 0) return;
    setBatchPublishing(true);
    setBatchProgress({ done: 0, total: batchSelected.size, current: "" });
    try {
      const ids = Array.from(batchSelected);
      const res = await fetch("/api/vehicles/batch-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleIds: ids, targetGroupIds: selectedGroupIds }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`${data.total} veiculos enfileirados — publicando em background`);
        setBatchSelected(new Set());
        setShowBatchModal(false);
        // Don't refetch immediately — backend processes in background.
        // List will update naturally on next refresh (user can pull-to-refresh).
      } else {
        toast.error("Erro ao publicar em lote");
      }
    } catch {
      toast.error("Erro de conexao");
    } finally {
      setBatchPublishing(false);
      setBatchProgress(null);
    }
  };

  const filtered = useMemo(() => {
    let result = vehicles;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(
        (v) =>
          v.model.toLowerCase().includes(s) ||
          v.brand?.toLowerCase().includes(s) ||
          v.color?.toLowerCase().includes(s)
      );
    }
    if (filters.states.length > 0) {
      // Filtra por estado em ordem de confiabilidade:
      // 1. v.state (extraido pela IA do anuncio) - mais confiavel
      // 2. v.sourceGroup.region (tag manual no grupo fonte)
      // 3. nome do grupo contem a UF (fallback ultimo)
      const wantedStates = filters.states.map(s => s.toUpperCase());
      result = result.filter(v => {
        const vState = (v.state || v.sourceGroup?.region || "").toUpperCase();
        if (vState && wantedStates.includes(vState)) return true;
        // Ultimo fallback: nome do grupo
        const groupName = v.sourceGroup?.name?.toUpperCase() || "";
        return wantedStates.some(s => groupName.includes(s));
      });
    }
    if (filters.priceRange) {
      const [min, max] = filters.priceRange.split("-").map(Number);
      result = result.filter(v => v.price >= min && (max ? v.price <= max : true));
    }
    if (filters.transmission) {
      result = result.filter(v => v.transmission === filters.transmission);
    }
    return result;
  }, [vehicles, search, filters]);

  const handleAction = async (id: string, action: "approve" | "reject" | "publish") => {
    if (action === "reject") {
      setRejectVehicleId(id);
      setRejectionReason("");
      return;
    }
    setActionLoading(id);
    try {
      const res = await fetch(`/api/vehicles/${id}/${action}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.status === "APPROVED" || action === "approve") {
          toast.success("Veiculo aprovado!", {
            action: {
              label: "Desfazer",
              onClick: async () => {
                const r = await fetch(`/api/vehicles/${id}/undo`, { method: "POST" });
                if (r.ok) {
                  toast.success("Acao desfeita");
                  fetchVehicles();
                } else {
                  const err = await r.json().catch(() => ({}));
                  toast.error(err.error || "Erro ao desfazer");
                }
              },
            },
            duration: 10000,
          });
          setVehicles((prev) => prev.filter((v) => v.id !== id));
        } else {
          toast.success("Publicacao iniciada!");
          setVehicles((prev) => prev.filter((v) => v.id !== id));
        }
      } else {
        const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        toast.error(err.error || `Erro ao ${action === "approve" ? "aprovar" : "publicar"}`);
        // Re-fetch to ensure list is in sync
        fetchVehicles();
      }
    } catch {
      toast.error("Erro de conexao");
      fetchVehicles();
    } finally {
      setActionLoading(null);
    }
  };

  const confirmReject = async () => {
    if (!rejectVehicleId) return;
    setActionLoading(rejectVehicleId);
    try {
      const res = await fetch(`/api/vehicles/${rejectVehicleId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rejectionReason: rejectionReason.trim() || undefined,
          rejectionTags: rejectionTags.length > 0 ? rejectionTags : undefined,
        }),
      });
      if (res.ok) {
        const rejectedId = rejectVehicleId;
        toast.success("Veiculo rejeitado.", {
          action: {
            label: "Desfazer",
            onClick: async () => {
              const r = await fetch(`/api/vehicles/${rejectedId}/undo`, { method: "POST" });
              if (r.ok) {
                toast.success("Acao desfeita");
                fetchVehicles();
              } else {
                const err = await r.json().catch(() => ({}));
                toast.error(err.error || "Erro ao desfazer");
              }
            },
          },
          duration: 10000,
        });
        setVehicles((prev) => prev.filter((v) => v.id !== rejectVehicleId));
        setRejectionTags([]);
        setRejectVehicleId(null);
      } else {
        const err = await res.json();
        toast.error(err.error || "Erro ao rejeitar");
      }
    } catch {
      toast.error("Erro de conexao");
    } finally {
      setActionLoading(null);
    }
  };

  const handlePublishDirect = async (id: string) => {
    const vehicle = vehicles.find((v) => v.id === id);
    if (!vehicle) return;
    // Estado: usa state do veiculo OU regiao do grupo origem como fallback
    const effectiveState = vehicle.state || vehicle.sourceGroup?.region || null;

    const preselect = (groups: WhatsAppGroup[]) => {
      if (effectiveState) {
        const regionGroups = groups.filter((g) => g.region === effectiveState);
        setQuickPublishGroups(regionGroups.map((g) => g.groupId));
        // Auto-expandir a regiao do veiculo no quick modal
        setExpandedRegions((prev) => new Set([...prev, `__quick_${effectiveState}`]));
      } else {
        setQuickPublishGroups([]);
      }
    };

    // Ensure target groups are loaded
    if (targetGroups.length === 0) {
      try {
        const res = await fetch("/api/groups?role=TARGET&active=true&counts=false");
        if (res.ok) {
          const groups: WhatsAppGroup[] = await res.json();
          setTargetGroups(groups);
          preselect(groups);
        }
      } catch {
        setTargetGroups([]);
        setQuickPublishGroups([]);
      }
    } else {
      preselect(targetGroups);
    }
    setQuickPublishVehicle(vehicle);
  };

  const confirmQuickPublish = async () => {
    if (!quickPublishVehicle || quickPublishGroups.length === 0) return;
    const id = quickPublishVehicle.id;
    setPublishingDirectId(id);
    try {
      const res = await fetch(`/api/vehicles/${id}/publish-direct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetGroupIds: quickPublishGroups }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Publicado em ${data.destinationGroups || quickPublishGroups.length} grupos`);
        setVehicles((prev) => prev.filter((v) => v.id !== id));
        setQuickPublishVehicle(null);
        setQuickPublishGroups([]);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Erro ao publicar");
        fetchVehicles();
      }
    } catch {
      toast.error("Erro de conexao");
      fetchVehicles();
    } finally {
      setPublishingDirectId(null);
    }
  };

  const handleUpdateField = async (id: string, field: string, value: string | number) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout
    try {
      const res = await fetch(`/api/vehicles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.details?.[0]?.message || err?.error || "Erro ao salvar";
        throw new Error(msg);
      }
      // Use server response to update local state (canonical source of truth)
      const updated = await res.json().catch(() => null);
      setVehicles((prev) => prev.map((v) => {
        if (v.id !== id) return v;
        if (updated && typeof updated === "object" && updated.id) {
          return { ...v, ...updated };
        }
        return { ...v, [field]: value };
      }));
    } finally {
      clearTimeout(timeout);
    }
  };

  const getAdText = (v: Vehicle, marginOverride?: number) =>
    formatVehicleAd(
      {
        model: v.model,
        brand: v.brand,
        year: v.year,
        yearModel: v.yearModel,
        km: v.km,
        price: v.price,
        fipePrice: v.fipePrice,
        transmission: v.transmission,
        fuel: v.fuel,
        features: v.features,
        rawDescription: v.rawDescription,
      },
      { profitMarginPercent: marginOverride ?? 0 }
    );

  const getPreviewAdText = (v: Vehicle) =>
    v.formattedAd || getAdText(v);

  const openRepublishModal = async (vehicle: Vehicle) => {
    setRepublishMode(true);
    setPublishVehicle(vehicle);
    setEditedPhotos({});
    setPublishTab("edit");
    setEditedAd(vehicle.formattedAd || "");
    const existingMargin = vehicle.sellingPrice && vehicle.price
      ? Math.round(((vehicle.sellingPrice / vehicle.price) - 1) * 100)
      : 10;
    setMargin(existingMargin);
    // Start empty — useEffect picks groups by region automatically.
    setSelectedGroupIds([]);
    try {
      const res = await fetch("/api/groups?role=TARGET&active=true&counts=false");
      if (res.ok) {
        const groups: WhatsAppGroup[] = await res.json();
        setTargetGroups(groups);
      }
    } catch {
      setTargetGroups([]);
    }
  };

  const openPublishModal = async (vehicle: Vehicle) => {
    setRepublishMode(false);
    setPublishVehicle(vehicle);
    setEditedPhotos({});
    setPublishTab("photo");
    // Start with empty selection — the auto-select-by-region useEffect picks
    // the right groups once both vehicle and targetGroups are loaded. If no
    // region is detected, selection stays empty (operator chooses manually).
    setSelectedGroupIds([]);
    // Fetch target groups
    try {
      const res = await fetch("/api/groups?role=TARGET&active=true&counts=false");
      if (res.ok) {
        const groups: WhatsAppGroup[] = await res.json();
        setTargetGroups(groups);
      }
    } catch {
      setTargetGroups([]);
    }
    // Fetch current margin setting
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        const m = data.profit_margin_percent ? parseFloat(data.profit_margin_percent) : 10;
        setMargin(m);
        setEditedAd(getAdText(vehicle, m));
      } else {
        setMargin(10);
        setEditedAd(getAdText(vehicle, 10));
      }
    } catch {
      setMargin(10);
      setEditedAd(getAdText(vehicle, 10));
    }
  };

  const handleMarginChange = (newMargin: number) => {
    setMargin(newMargin);
    if (publishVehicle) {
      // Margem regenera o texto inteiro (comportamento esperado, descrito no
      // hint do modal). Se o operador quiser editar manualmente o texto, deve
      // ajustar a margem PRIMEIRO e editar depois.
      setEditedAd(getAdText(publishVehicle, newMargin));
    }
  };

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  /**
   * Publica em batch todos os veiculos com preparedAt != null.
   * Se passar `state`, filtra so daquele estado. Senao publica todos os prontos.
   */
  const handlePublishPrepared = async (state?: string) => {
    const targetCount = state
      ? filtered.filter(v => ((v.state || v.sourceGroup?.region || "").toUpperCase() === state)).length
      : filtered.length;
    const label = state ? `Publicar ${targetCount} veiculos de ${state}?` : `Publicar todos os ${targetCount} prontos?`;
    if (!confirm(label + "\n\nEles serao postados em background com delays anti-ban.")) return;

    setBatchPublishing(true);
    try {
      const res = await fetch("/api/vehicles/batch-publish-prepared", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state ? { state } : {}),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${data.queued} veiculos enfileirados`, { duration: 6000 });
        // Optimistic: remove os enfileirados da lista
        setVehicles(prev => state
          ? prev.filter(v => ((v.state || v.sourceGroup?.region || "").toUpperCase() !== state))
          : []
        );
      } else {
        toast.error(data.error || "Erro ao enfileirar");
      }
    } catch (e) {
      toast.error(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBatchPublishing(false);
    }
  };

  /**
   * Salva o veiculo como "preparado pra postar depois". Mesmo body do publish
   * mas chama /prepare em vez do publish-direct/publish. Fecha modal otimisticamente.
   */
  const handlePrepare = async () => {
    if (!publishVehicle) return;
    if (selectedGroupIds.length === 0) {
      toast.error("Selecione pelo menos um grupo destino antes de preparar");
      return;
    }
    const vehicleId = publishVehicle.id;
    const sellingPrice = publishVehicle.price * (1 + margin / 100);
    const photos = parseArray(publishVehicle.photos);
    const updatedPhotos = Object.keys(editedPhotos).length > 0
      ? photos.map((p, i) => editedPhotos[i] || p)
      : undefined;

    // Optimistic close
    setVehicles((prev) => prev.filter((v) => v.id !== vehicleId));
    setPublishVehicle(null);
    setEditedAd("");
    setEditedPhotos({});
    toast.loading("Salvando como pronto...", { id: `prepare-${vehicleId}` });

    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formattedAd: editedAd,
          sellingPrice,
          targetGroupIds: selectedGroupIds,
          ...(updatedPhotos ? { photos: updatedPhotos } : {}),
        }),
      });
      if (res.ok) {
        toast.success(`Pronto pra postar depois (${selectedGroupIds.length} grupos)`, {
          id: `prepare-${vehicleId}`,
          duration: 5000,
        });
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Erro ao preparar", { id: `prepare-${vehicleId}` });
        fetchVehicles();
      }
    } catch (e) {
      toast.error(`Erro: ${e instanceof Error ? e.message : String(e)}`, { id: `prepare-${vehicleId}` });
      fetchVehicles();
    }
  };

  const handlePublish = async () => {
    if (!publishVehicle) return;
    if (selectedGroupIds.length === 0) {
      toast.error("Selecione pelo menos um grupo destino");
      return;
    }

    // Snapshot everything we need before closing the modal.
    const vehicleId = publishVehicle.id;
    const vehicleStatus = publishVehicle.status;
    const sellingPrice = publishVehicle.price * (1 + margin / 100);

    const updateData: Record<string, unknown> = { formattedAd: editedAd, sellingPrice };
    if (Object.keys(editedPhotos).length > 0) {
      const photos = parseArray(publishVehicle.photos);
      updateData.photos = photos.map((p, i) => editedPhotos[i] || p);
    }

    let endpoint: string;
    if (republishMode) {
      endpoint = `/api/vehicles/${vehicleId}/republish`;
    } else if (vehicleStatus === "PENDING") {
      endpoint = `/api/vehicles/${vehicleId}/publish-direct`;
    } else {
      endpoint = `/api/vehicles/${vehicleId}/publish`;
    }

    // Optimistic UI: close modal + remove from list IMMEDIATELY.
    // Both requests run in background; result toast fires when POST resolves.
    if (!republishMode) {
      setVehicles((prev) => prev.filter((v) => v.id !== vehicleId));
    }
    setPublishVehicle(null);
    setEditedAd("");
    setEditedPhotos({});

    toast.loading("Publicando...", { id: `publish-${vehicleId}` });

    // Fire PUT + POST in parallel — neither blocks the UI.
    const putPromise = fetch(`/api/vehicles/${vehicleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateData),
    }).catch(() => null);

    const postPromise = fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetGroupIds: selectedGroupIds,
        formattedAd: editedAd,
        sellingPrice,
      }),
    });

    // Don't await PUT — it doesn't block the publish endpoint (which reads
    // formattedAd from the request body).
    void putPromise;

    try {
      const res = await postPromise;
      if (res.ok) {
        toast.success(republishMode ? "Reenvio iniciado!" : "Publicacao iniciada!", {
          id: `publish-${vehicleId}`,
        });
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Erro ao publicar", { id: `publish-${vehicleId}` });
        // Re-fetch only on error so user sees the vehicle re-appear with correct state
        fetchVehicles();
      }
    } catch {
      toast.error("Erro de conexao", { id: `publish-${vehicleId}` });
      fetchVehicles();
    }
  };

  // Auto-save edicoes ao fechar modal sem publicar
  const handleClosePublishModal = async () => {
    if (!publishVehicle) return;
    const hasEdits = editedAd && editedAd !== (publishVehicle.formattedAd || "");
    const hasPhotoEdits = Object.keys(editedPhotos).length > 0;
    if (hasEdits || hasPhotoEdits) {
      try {
        const updateData: Record<string, unknown> = {};
        if (hasEdits) updateData.formattedAd = editedAd;
        if (hasPhotoEdits) {
          const photos = parseArray(publishVehicle.photos);
          updateData.photos = photos.map((p, i) => editedPhotos[i] || p);
        }
        await fetch(`/api/vehicles/${publishVehicle.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateData),
        });
        toast.success("Edicoes salvas");
      } catch {
        toast.error("Erro ao salvar edicoes");
      }
    }
    setPublishVehicle(null);
    setEditedAd("");
    setEditedPhotos({});
  };

  const formatPrice = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  const formatKm = (v: number) => v.toLocaleString("pt-BR") + " km";

  // Prepare swipe-compatible vehicles for PENDING tab
  const swipeVehicles = useMemo(() =>
    filtered.map((v) => ({
      ...v,
      features: parseArray(v.features),
      photos: parseArray(v.photos),
    })),
    [filtered]
  );

  const isPending = activeTab === "PENDING";

  // Keyboard shortcuts for the PENDING tab swipe stack
  useEffect(() => {
    if (!isPending) return;
    const handler = (e: KeyboardEvent) => {
      // Skip if typing in input/textarea
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
      // Skip if any modal is open
      if (rejectVehicleId || publishVehicle || quickPublishVehicle || galleryVehicle) return;

      const topVehicle = swipeVehicles[0];
      if (!topVehicle) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleAction(topVehicle.id, "reject");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleAction(topVehicle.id, "approve");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        handlePublishDirect(topVehicle.id);
      } else if (e.key === "?") {
        e.preventDefault();
        setShowShortcuts(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, swipeVehicles, rejectVehicleId, publishVehicle, quickPublishVehicle, galleryVehicle]);

  return (
    <>
      <Header title="Veiculos" subtitle="Fila de revisao e publicacao" />

      <div className="p-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="glass overflow-x-auto flex-nowrap whitespace-nowrap">
              <TabsTrigger value="PENDING" className="data-[state=active]:bg-warning/10 data-[state=active]:text-warning">
                Pendentes
              </TabsTrigger>
              <TabsTrigger value="APPROVED" className="data-[state=active]:bg-success/10 data-[state=active]:text-success">
                Aprovados
              </TabsTrigger>
              <TabsTrigger value="PREPARED" className="data-[state=active]:bg-info/10 data-[state=active]:text-info">
                Prontos
              </TabsTrigger>
              <TabsTrigger value="PUBLISHED" className="data-[state=active]:bg-cugini-orange/10 data-[state=active]:text-cugini-orange">
                Publicados
              </TabsTrigger>
              <TabsTrigger value="REJECTED" className="data-[state=active]:bg-destructive/10 data-[state=active]:text-destructive">
                Rejeitados
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Filter chips */}
          <div>
          <div className="flex flex-wrap gap-1.5">
            {["RS", "SC", "PR", "SP"].map(s => (
              <button
                key={s}
                onClick={() => setFilters(f => ({
                  ...f,
                  states: f.states.includes(s) ? f.states.filter(x => x !== s) : [...f.states, s]
                }))}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs border transition-all",
                  filters.states.includes(s)
                    ? "bg-cugini-orange/10 border-cugini-orange/30 text-cugini-orange"
                    : "bg-card/50 border-border text-muted-foreground hover:border-white/20"
                )}
              >
                {s}
              </button>
            ))}
            {[
              { label: "30-60k", value: "30000-60000" },
              { label: "60-100k", value: "60000-100000" },
              { label: "100-150k", value: "100000-150000" },
              { label: "150k+", value: "150000-0" },
            ].map(p => (
              <button
                key={p.value}
                onClick={() => setFilters(f => ({ ...f, priceRange: f.priceRange === p.value ? "" : p.value }))}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs border transition-all",
                  filters.priceRange === p.value
                    ? "bg-cugini-orange/10 border-cugini-orange/30 text-cugini-orange"
                    : "bg-card/50 border-border text-muted-foreground hover:border-white/20"
                )}
              >
                {p.label}
              </button>
            ))}
            {["AUTOMATICO", "MANUAL", "CVT"].map(t => (
              <button
                key={t}
                onClick={() => setFilters(f => ({ ...f, transmission: f.transmission === t ? "" : t }))}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs border transition-all",
                  filters.transmission === t
                    ? "bg-cugini-orange/10 border-cugini-orange/30 text-cugini-orange"
                    : "bg-card/50 border-border text-muted-foreground hover:border-white/20"
                )}
              >
                {t === "AUTOMATICO" ? "Aut." : t === "MANUAL" ? "Manual" : "CVT"}
              </button>
            ))}
          </div>
          </div>

          {!isPending && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {activeTab === "APPROVED" && filtered.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={selectAllApproved}
                  className="gap-1.5 border-border text-xs shrink-0"
                >
                  {batchSelected.size === filtered.filter((v) => v.status === "APPROVED").length && batchSelected.size > 0
                    ? <CheckSquare className="h-3.5 w-3.5 text-cugini-orange" />
                    : <Square className="h-3.5 w-3.5" />
                  }
                  Selecionar todos
                </Button>
              )}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar veiculo..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-card border-border"
                />
              </div>
            </div>
          )}
        </div>

        {/* Banner de "Prontos" — botoes pra publicar em massa por estado */}
        {activeTab === "PREPARED" && !loading && filtered.length > 0 && (() => {
          const byState = new Map<string, number>();
          for (const v of filtered) {
            const s = (v.state || v.sourceGroup?.region || "?").toUpperCase();
            byState.set(s, (byState.get(s) ?? 0) + 1);
          }
          const states = Array.from(byState.entries()).sort((a, b) => b[1] - a[1]);
          return (
            <div className="glass rounded-2xl p-4 border border-info/20">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-info" />
                    <h3 className="text-sm font-semibold">Prontos pra postar</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {filtered.length} veiculo{filtered.length !== 1 ? "s" : ""} preparado{filtered.length !== 1 ? "s" : ""} -
                    publique todos de uma vez por estado
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handlePublishPrepared()}
                  className="gap-1.5 gradient-orange text-white border-0 shrink-0"
                  disabled={batchPublishing}
                >
                  {batchPublishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Publicar todos ({filtered.length})
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {states.map(([state, count]) => (
                  <button
                    key={state}
                    onClick={() => handlePublishPrepared(state)}
                    disabled={batchPublishing}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium border border-info/30 bg-info/5 text-info hover:bg-info/15 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                  >
                    <Send className="h-3 w-3" />
                    {state} ({count})
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-cugini-orange" />
          </div>
        ) : isPending ? (
          /* Tinder-style swipe for PENDING */
          <>
          <div className="hidden sm:flex items-center justify-center gap-3 text-[11px] text-muted-foreground/70 mt-2">
            <kbd className="rounded bg-card border border-border px-1.5 py-0.5">&larr;</kbd> Rejeitar
            <kbd className="rounded bg-card border border-border px-1.5 py-0.5">&rarr;</kbd> Aprovar
            <kbd className="rounded bg-card border border-border px-1.5 py-0.5">&uarr;</kbd> Publicar direto
            <button
              onClick={() => setShowShortcuts(true)}
              className="rounded bg-card border border-border px-1.5 py-0.5 hover:text-foreground transition-colors"
              title="Atalhos de teclado"
            >
              ? Ajuda
            </button>
          </div>
          <SwipeStack
            vehicles={swipeVehicles}
            onApprove={(id) => handleAction(id, "approve")}
            onReject={(id) => handleAction(id, "reject")}
            onPhotoClick={(v) => {
              const vehicle = vehicles.find((veh) => veh.id === v.id);
              if (vehicle) {
                setGalleryVehicle(vehicle);
                setGalleryIndex(0);
              }
            }}
            onDeletePhoto={async (vehicleId, photoIndex) => {
              try {
                const res = await fetch(`/api/vehicles/${vehicleId}/delete-photo?index=${photoIndex}`, { method: "DELETE" });
                if (res.ok) {
                  toast.success("Foto excluida");
                  fetchVehicles();
                } else {
                  toast.error("Erro ao excluir foto");
                }
              } catch {
                toast.error("Erro de conexao");
              }
            }}
            actionLoading={actionLoading}
            onPublishDirect={handlePublishDirect}
            onUpdateField={handleUpdateField}
            publishingDirectId={publishingDirectId}
            onEditPhoto={(v) => {
              const vehicle = vehicles.find((veh) => veh.id === v.id);
              if (vehicle) {
                openPublishModal(vehicle);
                setPublishTab("photo");
              }
            }}
          />
          </>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-cugini-orange/[0.06] border border-cugini-orange/10">
              <Car className="h-10 w-10 text-cugini-orange/40" />
            </div>
            <p className="text-base font-medium text-foreground/70">Fila vazia</p>
            <p className="mt-1 text-sm text-muted-foreground/50">Nenhum veiculo nesta categoria no momento</p>
          </div>
        ) : (
          /* Grid for APPROVED / PUBLISHED / REJECTED */
          <motion.div
            layout
            className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
          >
            <AnimatePresence>
              {filtered.map((vehicle) => {
                const photos = parseArray(vehicle.photos);
                const features = parseArray(vehicle.features);
                const sc = statusConfig[vehicle.status] || statusConfig.PENDING;

                return (
                  <motion.div
                    key={vehicle.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="glass rounded-2xl overflow-hidden hover:glow-orange-sm transition-all duration-300"
                  >
                    {/* Image */}
                    <div className="relative h-40 sm:h-52 bg-card">
                      {activeTab === "APPROVED" && (
                        <button
                          className="absolute top-2 left-2 z-10"
                          onClick={(e) => { e.stopPropagation(); toggleBatchSelect(vehicle.id); }}
                        >
                          {batchSelected.has(vehicle.id)
                            ? <CheckSquare className="h-6 w-6 text-cugini-orange drop-shadow" />
                            : <Square className="h-6 w-6 text-white/70 drop-shadow" />
                          }
                        </button>
                      )}
                      {photos.length > 0 ? (
                        <img
                          src={photos[0]}
                          alt={vehicle.model}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Car className="h-12 w-12 text-muted-foreground/20" />
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />
                      <Badge className={cn("absolute top-3 right-3 border", sc.color)}>
                        {sc.label}
                      </Badge>
                      <h3 className="absolute bottom-3 left-4 right-4 font-semibold text-white text-base drop-shadow-lg truncate">
                        {vehicle.brand && `${vehicle.brand} `}{vehicle.model}
                      </h3>
                    </div>

                    {/* Info */}
                    <div className="p-5 space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {vehicle.year} &middot; {formatKm(vehicle.km)}
                        {vehicle.transmission && ` \u00B7 ${vehicle.transmission}`}
                        {vehicle.fuel && ` \u00B7 ${vehicle.fuel}`}
                      </p>

                      <div className="flex items-baseline justify-between">
                        <div>
                          {vehicle.fipePrice && (
                            <p className="text-xs text-muted-foreground">
                              FIPE: {formatPrice(vehicle.fipePrice)}
                            </p>
                          )}
                          <p className="text-xl font-bold text-cugini-orange">
                            {formatPrice(vehicle.sellingPrice || vehicle.price)}
                          </p>
                        </div>
                        {vehicle.fuel === "HIBRIDO" && (
                          <Badge variant="outline" className="border-success/30 text-success text-xs">
                            Hibrido
                          </Badge>
                        )}
                      </div>

                      {features.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {features.slice(0, 4).map((f: string, i: number) => (
                            <span
                              key={i}
                              className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {f}
                            </span>
                          ))}
                          {features.length > 4 && (
                            <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] text-muted-foreground">
                              +{features.length - 4}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Rejection reason */}
                      {vehicle.status === "REJECTED" && vehicle.rejectionReason && (
                        <div className="flex items-start gap-2 rounded-lg bg-destructive/5 border border-destructive/10 p-2.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                          <p className="text-xs text-destructive/80 leading-relaxed">
                            {vehicle.rejectionReason}
                          </p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        {vehicle.status === "APPROVED" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => openPublishModal(vehicle)}
                              disabled={actionLoading === vehicle.id}
                              className="flex-1 gap-1.5 gradient-orange text-white border-0"
                            >
                              {actionLoading === vehicle.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                              Publicar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                              onClick={() => handleAction(vehicle.id, "reject")}
                              disabled={actionLoading === vehicle.id}
                              title="Rejeitar"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {vehicle.status === "PUBLISHED" && (
                          <Button
                            size="sm"
                            onClick={() => openRepublishModal(vehicle)}
                            disabled={actionLoading === vehicle.id}
                            className="flex-1 gap-1.5 border-cugini-orange/30 text-cugini-orange hover:bg-cugini-orange/10"
                            variant="outline"
                          >
                            {actionLoading === vehicle.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Send className="h-3.5 w-3.5" />
                            )}
                            Reenviar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 border-border"
                          onClick={() => setPreviewVehicle(vehicle)}
                          title="Preview WhatsApp"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Pagination */}
        {!isPending && totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Anterior
            </button>
            <span className="text-xs text-muted-foreground">
              {page} / {totalPages} ({totalCount} veiculos)
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              Proximo
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Sticky batch action bar */}
      {activeTab === "APPROVED" && batchSelected.size > 0 && (
        <div className="fixed bottom-16 md:bottom-4 left-0 right-0 md:left-64 z-30 px-4 pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-2xl mx-auto glass border border-cugini-orange/20 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-2xl">
            <Layers className="h-5 w-5 text-cugini-orange shrink-0" />
            <span className="text-sm font-medium flex-1">
              {batchSelected.size} veiculo{batchSelected.size > 1 ? "s" : ""} selecionado{batchSelected.size > 1 ? "s" : ""}
            </span>
            <button
              onClick={() => setBatchSelected(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Limpar
            </button>
            <Button
              size="sm"
              onClick={() => {
                if (targetGroups.length === 0) {
                  fetch("/api/groups?role=TARGET&active=true&counts=false")
                    .then((r) => r.json())
                    .then((data) => {
                      setTargetGroups(data);
                      setSelectedGroupIds(data.map((g: WhatsAppGroup) => g.id));
                    });
                }
                setShowBatchModal(true);
              }}
              className="gap-1.5 gradient-orange text-white border-0 shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
              Publicar em lote
            </Button>
          </div>
        </div>
      )}

      {/* WhatsApp Preview Dialog (read-only) */}
      <Dialog open={!!previewVehicle} onOpenChange={(open) => !open && setPreviewVehicle(null)}>
        <DialogContent showCloseButton={false} className="sm:max-w-md p-0 overflow-hidden bg-transparent ring-0">
          <div className="rounded-xl overflow-hidden">
            <div className="bg-[#1F2C34] px-4 py-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-[#2A3942] flex items-center justify-center">
                <MessageCircle className="h-4 w-4 text-[#8696A0]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#E9EDEF] truncate">Grupo de Vendas</p>
                <p className="text-[11px] text-[#8696A0]">Preview da mensagem</p>
              </div>
              <button onClick={() => setPreviewVehicle(null)} className="text-[#8696A0] hover:text-[#E9EDEF] transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <WhatsAppBubble
              text={previewVehicle ? getPreviewAdText(previewVehicle) : ""}
              photo={previewVehicle ? parseArray(previewVehicle.photos)[0] : undefined}
              photoCount={previewVehicle ? parseArray(previewVehicle.photos).length : 0}
            />
            <div className="bg-[#1F2C34] px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs text-[#8696A0]">Assim aparecera no WhatsApp</span>
              <button
                onClick={() => {
                  if (!previewVehicle) return;
                  navigator.clipboard.writeText(getPreviewAdText(previewVehicle));
                  toast.success("Texto copiado!");
                }}
                className="flex items-center gap-1.5 text-xs text-[#00A884] hover:text-[#06CF9C] transition-colors"
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar texto
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Publish Modal (enhanced) */}
      <Dialog open={!!publishVehicle} onOpenChange={(open) => { if (!open) handleClosePublishModal(); }}>
        <DialogContent showCloseButton={false} className="inset-0 translate-x-0 translate-y-0 max-w-none rounded-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-3xl sm:rounded-xl p-0 overflow-hidden bg-[#0D0D0D] ring-1 ring-white/10 h-full sm:h-auto">
          <div className="flex flex-col h-full sm:max-h-[90vh]">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-white/10 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-foreground">{republishMode ? "Reenviar veiculo" : "Publicar veiculo"}</h3>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {publishVehicle?.brand && `${publishVehicle.brand} `}{publishVehicle?.model}
                  {publishVehicle && ` \u00B7 ${formatPrice(publishVehicle.price)} (custo)`}
                </p>
                {/* Source origin chip \u2014 group/community/region the car came from */}
                {publishVehicle && (publishVehicle.sourceGroup || publishVehicle.state) && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {publishVehicle.sourceGroup && (() => {
                      const sg = publishVehicle.sourceGroup;
                      const Icon = sg.isAnnounce ? Radio
                        : sg.isCommunity ? Building2
                        : sg.groupId.endsWith("@broadcast") ? Megaphone
                        : sg.groupId.endsWith("@s.whatsapp.net") ? User
                        : Users;
                      return (
                        <span
                          className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] border border-white/10 px-1.5 py-0.5 text-[11px] text-muted-foreground max-w-[260px]"
                          title={sg.name}
                        >
                          <Icon className="h-3 w-3 shrink-0" />
                          <span className="truncate">{sg.name}</span>
                        </span>
                      );
                    })()}
                    {(publishVehicle.state || publishVehicle.sourceGroup?.region) && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-cugini-orange/10 border border-cugini-orange/30 px-1.5 py-0.5 text-[11px] font-semibold text-cugini-orange uppercase tracking-wide">
                        <MapPin className="h-3 w-3" />
                        {publishVehicle.state || publishVehicle.sourceGroup?.region}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button onClick={handleClosePublishModal} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tab switcher */}
            <div className="flex border-b border-white/10">
              {([
                { key: "photo" as const, label: "Editar Foto", icon: ImageIcon },
                { key: "edit" as const, label: "Editar Texto", icon: Pencil },
                { key: "preview" as const, label: "Preview", icon: Eye },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setPublishTab(tab.key)}
                  className={cn(
                    "flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors",
                    publishTab === tab.key
                      ? "text-cugini-orange border-b-2 border-cugini-orange"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {publishTab === "photo" && publishVehicle && (
                <>
                  {/* Mobile: show thumbnail + fullscreen edit button */}
                  <div className="sm:hidden flex flex-col items-center gap-3 py-4 px-4">
                    {(() => {
                      const pPhotos = parseArray(publishVehicle.photos);
                      const displayPhoto = editedPhotos[0] || pPhotos[0];
                      return displayPhoto ? (
                        <img src={displayPhoto} alt="" className="w-full max-h-48 object-contain rounded-xl" />
                      ) : null;
                    })()}
                    <Button
                      variant="outline"
                      className="gap-2 border-cugini-orange/30 text-cugini-orange"
                      onClick={() => setMobileEditorFullscreen(true)}
                    >
                      <Pencil className="h-4 w-4" />
                      Editar foto em tela cheia
                    </Button>
                  </div>
                  {/* Mobile fullscreen editor */}
                  {mobileEditorFullscreen && (
                    <div className="sm:hidden">
                      <PhotoEditor
                        photos={parseArray(publishVehicle.photos)}
                        editedPhotos={editedPhotos}
                        defaultFullscreen
                        onFullscreenChange={(fs) => {
                          if (!fs) setMobileEditorFullscreen(false);
                        }}
                        onPhotoEdited={(index, dataUrl) => {
                          setEditedPhotos((prev) => ({ ...prev, [index]: dataUrl }));
                        }}
                        onPhotoReset={(index) => {
                          setEditedPhotos((prev) => {
                            const next = { ...prev };
                            delete next[index];
                            return next;
                          });
                        }}
                      />
                    </div>
                  )}
                  {/* Desktop: normal inline editor */}
                  <div className="hidden sm:block">
                    <PhotoEditor
                      photos={parseArray(publishVehicle.photos)}
                      editedPhotos={editedPhotos}
                      onPhotoEdited={(index, dataUrl) =>
                        setEditedPhotos((prev) => ({ ...prev, [index]: dataUrl }))
                      }
                      onPhotoReset={(index) =>
                        setEditedPhotos((prev) => {
                          const next = { ...prev };
                          delete next[index];
                          return next;
                        })
                      }
                    />
                  </div>
                </>
              )}

              {publishTab === "edit" && (
                <div className="p-4">
                  <textarea
                    value={editedAd}
                    onChange={(e) => setEditedAd(e.target.value)}
                    className="w-full h-[50vh] sm:h-64 rounded-lg bg-card border border-border p-3 text-sm text-foreground font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-cugini-orange/50 focus:border-cugini-orange/50"
                    placeholder="Texto do anuncio..."
                  />
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Edite o texto acima. Alterar a margem abaixo regenera automaticamente.
                  </p>
                </div>
              )}

              {publishTab === "preview" && publishVehicle && (
                <div>
                  {/* Before/After toggle */}
                  <div className="flex items-center justify-center gap-1 py-2.5 border-b border-white/5">
                    <button
                      onClick={() => setPreviewMode("before")}
                      className={cn(
                        "px-3 py-1 rounded-l-lg text-xs font-medium transition-all border",
                        previewMode === "before"
                          ? "bg-red-500/10 border-red-500/30 text-red-400"
                          : "bg-card border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Como veio
                    </button>
                    <div className="flex items-center px-1.5">
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <button
                      onClick={() => setPreviewMode("after")}
                      className={cn(
                        "px-3 py-1 rounded-r-lg text-xs font-medium transition-all border",
                        previewMode === "after"
                          ? "bg-success/10 border-success/30 text-success"
                          : "bg-card border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Como ficou
                    </button>
                  </div>

                  {previewMode === "before" ? (
                    /* Original message from source group */
                    <div>
                      <div className="bg-[#1F2C34] px-4 py-2 flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-[#2A3942] flex items-center justify-center">
                          <Users className="h-3 w-3 text-[#8696A0]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-[#E9EDEF] truncate">
                            {publishVehicle.sourceGroup?.name || "Grupo de Repasse"}
                          </p>
                          <p className="text-[9px] text-[#8696A0]">Mensagem original</p>
                        </div>
                        <Badge className="text-[9px] bg-red-500/10 text-red-400 border-red-500/20">
                          Original
                        </Badge>
                      </div>
                      <div
                        className="p-4 min-h-[140px] sm:min-h-[200px]"
                        style={{
                          backgroundColor: "#0B141A",
                          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                        }}
                      >
                        <div className="max-w-[85%]">
                          <div className="bg-[#1F2C34] rounded-lg overflow-hidden shadow-lg">
                            {parseArray(publishVehicle.photos)[0] && (
                              <img
                                src={parseArray(publishVehicle.photos)[0]}
                                alt=""
                                className="w-full h-40 object-cover"
                              />
                            )}
                            <div className="px-2.5 py-1.5">
                              <p className="text-[13px] text-[#E9EDEF] whitespace-pre-wrap leading-[18px]">
                                {publishVehicle.rawDescription || "Sem descricao original"}
                              </p>
                              <div className="flex items-center justify-end gap-1 mt-0.5 -mb-0.5">
                                <span className="text-[10px] text-[#8696A0]">
                                  {new Date(publishVehicle.capturedAt).toLocaleTimeString("pt-BR", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Reformatted Cugini message */
                    <div>
                      <div className="bg-[#1F2C34] px-4 py-2 flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-cugini-orange/20 flex items-center justify-center">
                          <MessageCircle className="h-3 w-3 text-cugini-orange" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-[#E9EDEF] truncate">
                            Cugini Repasses
                          </p>
                          <p className="text-[9px] text-[#8696A0]">Mensagem reformatada</p>
                        </div>
                        <Badge className="text-[9px] bg-success/10 text-success border-success/20">
                          Reformatado
                        </Badge>
                      </div>
                      <WhatsAppBubble
                        text={editedAd}
                        photo={editedPhotos[0] || parseArray(publishVehicle.photos)[0]}
                        photoCount={parseArray(publishVehicle.photos).length}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Margin + Groups section */}
            <div className="border-t border-white/10">
              {/* Margin */}
              <div className="px-5 py-3 flex items-center gap-3 border-b border-white/5">
                <Percent className="h-4 w-4 text-cugini-orange flex-shrink-0" />
                <span className="text-xs text-muted-foreground whitespace-nowrap">Margem:</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={margin}
                    onChange={(e) => handleMarginChange(parseFloat(e.target.value) || 0)}
                    className="w-16 h-7 rounded bg-card border border-border px-2 text-sm text-foreground text-center focus:outline-none focus:ring-1 focus:ring-cugini-orange/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <div className="flex-1" />
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Preco venda</p>
                  <p className="text-sm font-bold text-cugini-orange">
                    {publishVehicle && formatPrice(publishVehicle.price * (1 + margin / 100))}
                  </p>
                </div>
              </div>

              {/* Group selection — collapsible on every screen size so foto fica visivel */}
              <div className="px-5 py-3 flex-1 overflow-y-auto min-h-0">
                <button
                  onClick={() => setExpandedRegions((prev) => {
                    const n = new Set(prev);
                    if (n.has("__groups_section")) n.delete("__groups_section");
                    else n.add("__groups_section");
                    // Persist user preference across modals/sessions
                    try {
                      localStorage.setItem(
                        "cugini_groups_section_open",
                        n.has("__groups_section") ? "1" : "0"
                      );
                    } catch { /* storage unavailable */ }
                    return n;
                  })}
                  className="w-full flex items-center gap-2 mb-2 hover:bg-white/[0.02] rounded-lg -mx-1 px-1 py-1 transition-colors"
                >
                  <Users className="h-4 w-4 text-cugini-orange flex-shrink-0" />
                  <span className="text-xs text-muted-foreground">Enviar para:</span>
                  <span className="text-xs font-medium text-cugini-orange">{selectedGroupIds.length} grupo{selectedGroupIds.length !== 1 ? "s" : ""}</span>
                  <div className="flex-1" />
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expandedRegions.has("__groups_section") && "rotate-180")} />
                </button>
                <div className={cn(expandedRegions.has("__groups_section") ? "block" : "hidden")}>
                {targetGroups.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60 pl-6">
                    Nenhum grupo destino configurado
                  </p>
                ) : (
                  <div className="space-y-2 pl-6">
                    {Array.from(groupsByRegion.entries()).map(([region, groups]) => {
                      const regionIds = groups.map(g => g.groupId);
                      const selectedCount = regionIds.filter(id => selectedGroupIds.includes(id)).length;
                      const allSelected = selectedCount === groups.length;
                      const someSelected = selectedCount > 0 && !allSelected;
                      const expanded = expandedRegions.has(region);
                      // Strip redundant "(SC)" / "[SC]" from group name when shown inside its region accordion
                      const trimName = (name: string) =>
                        name.replace(new RegExp(`\\s*[\\(\\[]${region}[\\)\\]]\\s*`, "i"), " ").replace(/\s+/g, " ").trim();
                      return (
                        <div key={region} className="border border-border rounded-xl overflow-hidden">
                          <button
                            onClick={() => toggleRegion(region)}
                            className="w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 hover:bg-white/[0.02] transition-colors min-h-[48px] sm:min-h-0"
                          >
                            <div className={cn(
                              "h-5 w-5 sm:h-4 sm:w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                              allSelected ? "bg-cugini-orange border-cugini-orange" : someSelected ? "bg-cugini-orange/50 border-cugini-orange" : "border-muted-foreground/30"
                            )}>
                              {(allSelected || someSelected) && <Check className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-white" />}
                            </div>
                            <span className="text-sm font-medium flex-1 text-left">{region}</span>
                            <span className="text-xs text-muted-foreground">{selectedCount}/{groups.length}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setExpandedRegions(prev => { const n = new Set(prev); if (n.has(region)) n.delete(region); else n.add(region); return n; }); }}
                              className="p-2 sm:p-1 hover:bg-white/[0.05] rounded -mr-1"
                              aria-label={expanded ? "Recolher" : "Expandir"}
                            >
                              <ChevronDown className={cn("h-4 w-4 sm:h-3.5 sm:w-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                            </button>
                          </button>
                          {expanded && (
                            <div className="px-3 sm:px-4 pb-3 flex flex-col sm:flex-row sm:flex-wrap gap-1 sm:gap-1.5">
                              {groups.map(group => {
                                const selected = selectedGroupIds.includes(group.groupId);
                                const displayName = trimName(group.name);
                                return (
                                  <button
                                    key={group.id}
                                    onClick={() => {
                                      if (selected) setSelectedGroupIds(p => p.filter(id => id !== group.groupId));
                                      else setSelectedGroupIds(p => [...p, group.groupId]);
                                    }}
                                    className={cn(
                                      "flex items-center gap-2 sm:gap-1.5 rounded-lg px-3 sm:px-2.5 py-2.5 sm:py-1 text-sm sm:text-xs border transition-all w-full sm:w-auto min-h-[44px] sm:min-h-0",
                                      selected ? "bg-cugini-orange/10 border-cugini-orange/30 text-cugini-orange" : "bg-card/50 border-border text-muted-foreground hover:border-white/20"
                                    )}
                                  >
                                    <div className={cn("h-4 w-4 sm:h-3 sm:w-3 rounded border flex items-center justify-center shrink-0", selected ? "bg-cugini-orange border-cugini-orange" : "border-muted-foreground/30")}>
                                      {selected && <Check className="h-2.5 w-2.5 sm:h-2 sm:w-2 text-white" />}
                                    </div>
                                    <span className="truncate text-left flex-1">{displayName}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="px-5 py-3 border-t border-white/10 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-border shrink-0"
                onClick={handleClosePublishModal}
              >
                Cancelar
              </Button>
              {!republishMode && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrepare}
                  disabled={
                    actionLoading === publishVehicle?.id ||
                    !editedAd.trim() ||
                    selectedGroupIds.length === 0
                  }
                  className="gap-1.5 border-info/30 text-info hover:bg-info/10 shrink-0"
                  title="Salva texto, fotos e grupos pra publicar depois (em massa por estado)"
                >
                  <Clock className="h-3.5 w-3.5" />
                  Salvar pronto
                </Button>
              )}
              <Button
                size="sm"
                onClick={handlePublish}
                disabled={
                  actionLoading === publishVehicle?.id ||
                  !editedAd.trim() ||
                  selectedGroupIds.length === 0
                }
                className="flex-1 gap-1.5 gradient-orange text-white border-0"
              >
                {actionLoading === publishVehicle?.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {republishMode ? "Confirmar e reenviar" : "Confirmar e publicar"}
                {selectedGroupIds.length > 0 && (
                  <span className="ml-1 text-[10px] opacity-80">
                    ({selectedGroupIds.length} grupo{selectedGroupIds.length !== 1 ? "s" : ""})
                  </span>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Photo Gallery + WhatsApp Preview Dialog */}
      <Dialog open={!!galleryVehicle} onOpenChange={(open) => !open && setGalleryVehicle(null)}>
        <DialogContent showCloseButton={false} className="inset-0 translate-x-0 translate-y-0 max-w-none rounded-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-2xl sm:rounded-xl p-0 overflow-hidden bg-[#0A0A0C] ring-1 ring-white/10 h-full sm:h-auto">
          {galleryVehicle && (() => {
            const gPhotos = parseArray(galleryVehicle.photos);
            return (
              <div className="flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      {galleryVehicle.brand && `${galleryVehicle.brand} `}{galleryVehicle.model}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {galleryVehicle.year} &middot; {formatKm(galleryVehicle.km)}
                      {galleryVehicle.sourceGroup && ` \u00B7 ${galleryVehicle.sourceGroup.name}`}
                    </p>
                  </div>
                  <button onClick={() => setGalleryVehicle(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Photo Gallery */}
                {gPhotos.length > 0 && (
                  <div className="relative bg-black">
                    <img
                      src={gPhotos[galleryIndex]}
                      alt={`Foto ${galleryIndex + 1}`}
                      className="w-full h-52 sm:h-80 object-contain"
                    />
                    {/* Nav arrows */}
                    {gPhotos.length > 1 && (
                      <>
                        <button
                          onClick={() => setGalleryIndex((i) => (i - 1 + gPhotos.length) % gPhotos.length)}
                          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white/80 hover:text-white hover:bg-black/80 transition-all"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => setGalleryIndex((i) => (i + 1) % gPhotos.length)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white/80 hover:text-white hover:bg-black/80 transition-all"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                        {/* Dots indicator */}
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                          {gPhotos.map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setGalleryIndex(i)}
                              className={cn(
                                "h-1.5 rounded-full transition-all",
                                i === galleryIndex ? "w-4 bg-cugini-orange" : "w-1.5 bg-white/40 hover:bg-white/60"
                              )}
                            />
                          ))}
                        </div>
                        {/* Counter */}
                        <div className="absolute top-3 right-3 bg-black/60 rounded-full px-2.5 py-0.5 text-[11px] text-white font-medium">
                          {galleryIndex + 1}/{gPhotos.length}
                        </div>
                      </>
                    )}
                    {/* Thumbnail strip */}
                    {gPhotos.length > 1 && (
                      <div className="flex gap-1 p-2 bg-black/80 overflow-x-auto">
                        {gPhotos.map((photo, i) => (
                          <button
                            key={i}
                            onClick={() => setGalleryIndex(i)}
                            className={cn(
                              "h-12 w-16 shrink-0 rounded overflow-hidden border-2 transition-all",
                              i === galleryIndex ? "border-cugini-orange" : "border-transparent opacity-50 hover:opacity-80"
                            )}
                          >
                            <img src={photo} alt="" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Original WhatsApp Message */}
                <div className="flex-1 overflow-y-auto">
                  <div className="bg-[#1F2C34] px-4 py-2 flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-[#2A3942] flex items-center justify-center">
                      <Users className="h-3 w-3 text-[#8696A0]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-[#E9EDEF] truncate">
                        {galleryVehicle.sourceGroup?.name || "Grupo de Repasse"}
                      </p>
                      <p className="text-[9px] text-[#8696A0]">Mensagem original do WhatsApp</p>
                    </div>
                    <Badge className="text-[9px] bg-[#00A884]/10 text-[#00A884] border-[#00A884]/20">
                      Original
                    </Badge>
                  </div>
                  <div
                    className="p-4"
                    style={{
                      backgroundColor: "#0B141A",
                      backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                    }}
                  >
                    <div className="max-w-[85%]">
                      <div className="bg-[#1F2C34] rounded-lg overflow-hidden shadow-lg">
                        <div className="px-2.5 py-1.5">
                          <p className="text-[13px] text-[#E9EDEF] whitespace-pre-wrap leading-[18px]">
                            {galleryVehicle.rawDescription || "Sem descricao original disponivel"}
                          </p>
                          <div className="flex items-center justify-end gap-1 mt-0.5 -mb-0.5">
                            <span className="text-[10px] text-[#8696A0]">
                              {new Date(galleryVehicle.capturedAt).toLocaleTimeString("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Rejection Reason Dialog */}
      <Dialog open={!!rejectVehicleId} onOpenChange={(open) => {
        if (!open) {
          setRejectVehicleId(null);
          setRejectionReason("");
          setRejectionTags([]);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Rejeitar veiculo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">Selecione um ou mais motivos:</p>
            <div className="space-y-1">
              {REJECTION_OPTIONS.map((opt) => {
                const checked = rejectionTags.includes(opt.id);
                return (
                  <label
                    key={opt.id}
                    className={cn(
                      "flex items-start gap-3 cursor-pointer rounded-lg p-2.5 border transition-colors",
                      checked
                        ? "bg-destructive/5 border-destructive/30"
                        : "border-border hover:bg-white/[0.03]"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setRejectionTags((prev) =>
                        e.target.checked ? [...prev, opt.id] : prev.filter((t) => t !== opt.id)
                      )}
                      className="mt-0.5 accent-destructive shrink-0"
                    />
                    <span className="text-sm leading-snug">{opt.label}</span>
                  </label>
                );
              })}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Outros detalhes (opcional)</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Ex: Carro de leilao suspeito..."
                rows={2}
                className="w-full rounded-lg bg-card border border-border p-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-destructive/50"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setRejectVehicleId(null);
                  setRejectionReason("");
                  setRejectionTags([]);
                }}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={confirmReject}
                disabled={(rejectionTags.length === 0 && !rejectionReason.trim()) || actionLoading === rejectVehicleId}
                className="flex-1 bg-destructive hover:bg-destructive/90 text-white border-0"
              >
                {actionLoading === rejectVehicleId ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                Rejeitar{rejectionTags.length > 0 && ` (${rejectionTags.length})`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Publish Modal */}
      <Dialog open={!!quickPublishVehicle} onOpenChange={(open) => {
        if (!open && !publishingDirectId) {
          setQuickPublishVehicle(null);
          setQuickPublishGroups([]);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-success" />
              Publicar direto
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {quickPublishVehicle && (
              <div className="rounded-lg bg-card border border-border p-3">
                <p className="text-sm font-medium">{quickPublishVehicle.brand} {quickPublishVehicle.model}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {quickPublishVehicle.year} • {quickPublishVehicle.km.toLocaleString("pt-BR")} km • {formatPrice(quickPublishVehicle.price)}
                  {(quickPublishVehicle.state || quickPublishVehicle.sourceGroup?.region) && (
                    <> • <span className="text-cugini-orange font-semibold">{quickPublishVehicle.state || quickPublishVehicle.sourceGroup?.region}</span></>
                  )}
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">Selecione os grupos para publicar:</p>

            <div className="max-h-[50vh] overflow-y-auto space-y-2">
              {Array.from(groupsByRegion.entries()).map(([region, groups]) => {
                const regionIds = groups.map((g) => g.groupId);
                const selectedCount = regionIds.filter((id) => quickPublishGroups.includes(id)).length;
                const allSelected = selectedCount === groups.length;
                const expanded = expandedRegions.has(`__quick_${region}`);
                return (
                  <div key={region} className="rounded-lg border border-border overflow-hidden">
                    <div className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
                      <button
                        onClick={() => {
                          if (allSelected) {
                            setQuickPublishGroups((prev) => prev.filter((id) => !regionIds.includes(id)));
                          } else {
                            setQuickPublishGroups((prev) => [...new Set([...prev, ...regionIds])]);
                          }
                        }}
                        className="flex items-center gap-3 flex-1 text-left"
                      >
                        <div className={cn(
                          "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                          allSelected ? "bg-cugini-orange border-cugini-orange" : selectedCount > 0 ? "bg-cugini-orange/50 border-cugini-orange" : "border-muted-foreground/30"
                        )}>
                          {(allSelected || selectedCount > 0) && <Check className="h-2.5 w-2.5 text-white" />}
                        </div>
                        <span className="text-sm font-medium">{region}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{selectedCount}/{groups.length}</span>
                      </button>
                      <button
                        onClick={() => setExpandedRegions((prev) => {
                          const next = new Set(prev);
                          if (next.has(`__quick_${region}`)) next.delete(`__quick_${region}`);
                          else next.add(`__quick_${region}`);
                          return next;
                        })}
                        className="p-1 rounded hover:bg-white/[0.05] shrink-0"
                        title={expanded ? "Recolher" : "Expandir"}
                      >
                        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                      </button>
                    </div>
                    {expanded && (
                      <div className="border-t border-border/50 bg-card/30 max-h-60 overflow-y-auto">
                        {groups.map((group) => {
                          const checked = quickPublishGroups.includes(group.groupId);
                          return (
                            <label
                              key={group.id}
                              className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-white/[0.03] transition-colors border-b border-border/30 last:border-0"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setQuickPublishGroups((prev) => [...new Set([...prev, group.groupId])]);
                                  } else {
                                    setQuickPublishGroups((prev) => prev.filter((id) => id !== group.groupId));
                                  }
                                }}
                                className="accent-cugini-orange shrink-0"
                              />
                              <span className="text-xs truncate flex-1">{group.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setQuickPublishVehicle(null);
                  setQuickPublishGroups([]);
                }}
                disabled={!!publishingDirectId}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={confirmQuickPublish}
                disabled={quickPublishGroups.length === 0 || !!publishingDirectId}
                className="flex-1 bg-success hover:bg-success/90 text-white border-0"
              >
                {publishingDirectId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Publicar ({quickPublishGroups.length})
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Keyboard Shortcuts Help Dialog */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Atalhos de teclado</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Rejeitar</span>
              <kbd className="rounded bg-card border border-border px-2 py-1 text-xs">&larr;</kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Aprovar</span>
              <kbd className="rounded bg-card border border-border px-2 py-1 text-xs">&rarr;</kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Publicar direto</span>
              <kbd className="rounded bg-card border border-border px-2 py-1 text-xs">&uarr;</kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Mostrar ajuda</span>
              <kbd className="rounded bg-card border border-border px-2 py-1 text-xs">?</kbd>
            </div>
            <p className="text-xs text-muted-foreground/60 pt-2 border-t border-border">
              Atalhos funcionam apenas na aba Pendentes, quando nao ha modais abertos e voce nao esta digitando.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Batch Publish Modal */}
      <Dialog open={showBatchModal} onOpenChange={(open) => !open && setShowBatchModal(false)}>
        <DialogContent showCloseButton={false} className="inset-0 translate-x-0 translate-y-0 max-w-none rounded-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-2xl sm:rounded-xl p-0 overflow-hidden bg-[#0D0D0D] ring-1 ring-white/10 h-full sm:h-auto">
          <div className="flex flex-col h-full sm:max-h-[95vh]">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">Publicar em lote</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {batchSelected.size} veiculo{batchSelected.size !== 1 ? "s" : ""} selecionado{batchSelected.size !== 1 ? "s" : ""}
                </p>
              </div>
              <button onClick={() => setShowBatchModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {batchPublishing ? (
                <div className="flex flex-col items-center gap-4 py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-cugini-orange" />
                  <p className="text-sm text-muted-foreground">Publicando veiculos...</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Enviar para:</span>
                    </div>
                    {targetGroups.length === 0 ? (
                      <p className="text-xs text-muted-foreground/60">Nenhum grupo destino configurado</p>
                    ) : (
                      <div className="space-y-2">
                        {Array.from(groupsByRegion.entries()).map(([region, groups]) => {
                          const regionIds = groups.map(g => g.id);
                          const selectedCount = regionIds.filter(id => selectedGroupIds.includes(id)).length;
                          const allSelected = selectedCount === groups.length;
                          const someSelected = selectedCount > 0 && !allSelected;
                          const expanded = expandedRegions.has(region);
                          const trimName = (name: string) =>
                            name.replace(new RegExp(`\\s*[\\(\\[]${region}[\\)\\]]\\s*`, "i"), " ").replace(/\s+/g, " ").trim();
                          return (
                            <div key={region} className="border border-border rounded-xl overflow-hidden">
                              <button
                                onClick={() => toggleRegionById(region)}
                                className="w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 hover:bg-white/[0.02] transition-colors min-h-[48px] sm:min-h-0"
                              >
                                <div className={cn(
                                  "h-5 w-5 sm:h-4 sm:w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                                  allSelected ? "bg-cugini-orange border-cugini-orange" : someSelected ? "bg-cugini-orange/50 border-cugini-orange" : "border-muted-foreground/30"
                                )}>
                                  {(allSelected || someSelected) && <Check className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-white" />}
                                </div>
                                <span className="text-sm font-medium flex-1 text-left">{region}</span>
                                <span className="text-xs text-muted-foreground">{selectedCount}/{groups.length}</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setExpandedRegions(prev => { const n = new Set(prev); if (n.has(region)) n.delete(region); else n.add(region); return n; }); }}
                                  className="p-2 sm:p-1 hover:bg-white/[0.05] rounded -mr-1"
                                  aria-label={expanded ? "Recolher" : "Expandir"}
                                >
                                  <ChevronDown className={cn("h-4 w-4 sm:h-3.5 sm:w-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                                </button>
                              </button>
                              {expanded && (
                                <div className="px-3 sm:px-4 pb-3 flex flex-col sm:flex-row sm:flex-wrap gap-1 sm:gap-1.5">
                                  {groups.map(group => {
                                    const selected = selectedGroupIds.includes(group.id);
                                    const displayName = trimName(group.name);
                                    return (
                                      <button
                                        key={group.id}
                                        onClick={() => {
                                          if (selected) setSelectedGroupIds(p => p.filter(id => id !== group.id));
                                          else setSelectedGroupIds(p => [...p, group.id]);
                                        }}
                                        className={cn(
                                          "flex items-center gap-2 sm:gap-1.5 rounded-lg px-3 sm:px-2.5 py-2.5 sm:py-1 text-sm sm:text-xs border transition-all w-full sm:w-auto min-h-[44px] sm:min-h-0",
                                          selected ? "bg-cugini-orange/10 border-cugini-orange/30 text-cugini-orange" : "bg-card/50 border-border text-muted-foreground hover:border-white/20"
                                        )}
                                      >
                                        <div className={cn("h-4 w-4 sm:h-3 sm:w-3 rounded border flex items-center justify-center shrink-0", selected ? "bg-cugini-orange border-cugini-orange" : "border-muted-foreground/30")}>
                                          {selected && <Check className="h-2.5 w-2.5 sm:h-2 sm:w-2 text-white" />}
                                        </div>
                                        <span className="truncate text-left flex-1">{displayName}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            {!batchPublishing && (
              <div className="px-5 py-4 border-t border-white/10 flex gap-3">
                <Button variant="outline" className="flex-1 border-border" onClick={() => setShowBatchModal(false)}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 gradient-orange text-white border-0 gap-1.5"
                  onClick={handleBatchPublish}
                  disabled={selectedGroupIds.length === 0}
                >
                  <Send className="h-4 w-4" />
                  Confirmar e publicar
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
