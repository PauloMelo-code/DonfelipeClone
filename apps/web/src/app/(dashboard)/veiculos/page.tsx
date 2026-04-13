"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
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
  capturedAt: string;
  sourceGroupId: string | null;
  sourceGroup: { name: string; groupId: string } | null;
}

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

export default function VeiculosPage() {
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
      const res = await fetch(`/api/vehicles?status=${activeTab}`);
      if (res.ok) {
        const data = await res.json();
        setVehicles(data.vehicles || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    setLoading(true);
    setBatchSelected(new Set());
    fetchVehicles();
  }, [fetchVehicles]);

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
        toast.success(`${data.totalPublished} de ${data.total} veiculos publicados!`);
        setBatchSelected(new Set());
        setShowBatchModal(false);
        fetchVehicles();
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
      result = result.filter(v => v.sourceGroup?.name && filters.states.some(s => v.sourceGroup!.name.toLowerCase().includes(s.toLowerCase())));
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
        toast.success(
          action === "approve" ? "Veiculo aprovado!" : "Publicacao iniciada!"
        );
        setVehicles((prev) => prev.filter((v) => v.id !== id));
      } else {
        const err = await res.json();
        toast.error(err.error || "Erro ao executar acao");
      }
    } catch {
      toast.error("Erro de conexao");
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
        body: JSON.stringify({ rejectionReason: rejectionReason.trim() || undefined }),
      });
      if (res.ok) {
        toast.success("Veiculo rejeitado.");
        setVehicles((prev) => prev.filter((v) => v.id !== rejectVehicleId));
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

  const getAdText = (v: Vehicle, marginOverride?: number) =>
    formatVehicleAd(
      {
        model: v.model,
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
    try {
      const res = await fetch("/api/groups?role=TARGET&active=true");
      if (res.ok) {
        const groups: WhatsAppGroup[] = await res.json();
        setTargetGroups(groups);
        setSelectedGroupIds(groups.map((g) => g.groupId));
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
    // Fetch target groups
    try {
      const res = await fetch("/api/groups?role=TARGET&active=true");
      if (res.ok) {
        const groups: WhatsAppGroup[] = await res.json();
        setTargetGroups(groups);
        setSelectedGroupIds(groups.map((g) => g.groupId));
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
      setEditedAd(getAdText(publishVehicle, newMargin));
    }
  };

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  const handlePublish = async () => {
    if (!publishVehicle) return;
    if (selectedGroupIds.length === 0) {
      toast.error("Selecione pelo menos um grupo destino");
      return;
    }
    setActionLoading(publishVehicle.id);
    try {
      const sellingPrice = publishVehicle.price * (1 + margin / 100);

      // Save edited ad text and photos first
      const updateData: Record<string, unknown> = { formattedAd: editedAd, sellingPrice };
      if (Object.keys(editedPhotos).length > 0) {
        const photos = parseArray(publishVehicle.photos);
        const updatedPhotos = photos.map((p, i) => editedPhotos[i] || p);
        updateData.photos = updatedPhotos;
      }
      await fetch(`/api/vehicles/${publishVehicle.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      // Publish or republish
      const endpoint = republishMode
        ? `/api/vehicles/${publishVehicle.id}/republish`
        : `/api/vehicles/${publishVehicle.id}/publish`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetGroupIds: selectedGroupIds,
          formattedAd: editedAd,
          sellingPrice,
        }),
      });
      if (res.ok) {
        toast.success(republishMode ? "Reenvio iniciado!" : "Publicacao iniciada!");
        if (!republishMode) {
          setVehicles((prev) => prev.filter((v) => v.id !== publishVehicle.id));
        }
        setPublishVehicle(null);
        fetchVehicles();
      } else {
        const err = await res.json();
        toast.error(err.error || "Erro ao publicar");
      }
    } catch {
      toast.error("Erro de conexao");
    } finally {
      setActionLoading(null);
    }
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

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-cugini-orange" />
          </div>
        ) : isPending ? (
          /* Tinder-style swipe for PENDING */
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
            actionLoading={actionLoading}
          />
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
                  fetch("/api/groups?role=TARGET&active=true")
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
      <Dialog open={!!publishVehicle} onOpenChange={(open) => !open && setPublishVehicle(null)}>
        <DialogContent showCloseButton={false} className="sm:max-w-3xl p-0 overflow-hidden bg-[#0D0D0D] ring-1 ring-white/10">
          <div className="flex flex-col h-full sm:max-h-[90vh]">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">{republishMode ? "Reenviar veiculo" : "Publicar veiculo"}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {publishVehicle?.brand && `${publishVehicle.brand} `}{publishVehicle?.model}
                  {publishVehicle && ` \u00B7 ${formatPrice(publishVehicle.price)} (custo)`}
                </p>
              </div>
              <button onClick={() => setPublishVehicle(null)} className="text-muted-foreground hover:text-foreground transition-colors">
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
                    className="w-full h-32 sm:h-64 rounded-lg bg-card border border-border p-3 text-sm text-foreground font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-cugini-orange/50 focus:border-cugini-orange/50"
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

              {/* Group selection — collapsible on mobile */}
              <div className="px-5 py-3 flex-1 overflow-y-auto min-h-0">
                <button
                  onClick={() => setExpandedRegions((prev) => {
                    const n = new Set(prev);
                    if (n.has("__groups_section")) n.delete("__groups_section");
                    else n.add("__groups_section");
                    return n;
                  })}
                  className="w-full flex items-center gap-2 mb-2 sm:pointer-events-none"
                >
                  <Users className="h-4 w-4 text-cugini-orange flex-shrink-0" />
                  <span className="text-xs text-muted-foreground">Enviar para:</span>
                  <span className="text-xs font-medium text-cugini-orange">{selectedGroupIds.length} grupo{selectedGroupIds.length !== 1 ? "s" : ""}</span>
                  <div className="flex-1" />
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform sm:hidden", expandedRegions.has("__groups_section") && "rotate-180")} />
                </button>
                <div className={cn("sm:block", expandedRegions.has("__groups_section") ? "block" : "hidden sm:block")}>
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
                      return (
                        <div key={region} className="border border-border rounded-xl overflow-hidden">
                          <button
                            onClick={() => toggleRegion(region)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
                          >
                            <div className={cn(
                              "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                              allSelected ? "bg-cugini-orange border-cugini-orange" : someSelected ? "bg-cugini-orange/50 border-cugini-orange" : "border-muted-foreground/30"
                            )}>
                              {(allSelected || someSelected) && <Check className="h-2.5 w-2.5 text-white" />}
                            </div>
                            <span className="text-sm font-medium flex-1 text-left">{region}</span>
                            <span className="text-xs text-muted-foreground">{selectedCount}/{groups.length}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setExpandedRegions(prev => { const n = new Set(prev); if (n.has(region)) n.delete(region); else n.add(region); return n; }); }}
                              className="p-1 hover:bg-white/[0.05] rounded"
                            >
                              <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                            </button>
                          </button>
                          {expanded && (
                            <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                              {groups.map(group => {
                                const selected = selectedGroupIds.includes(group.groupId);
                                return (
                                  <button
                                    key={group.id}
                                    onClick={() => {
                                      if (selected) setSelectedGroupIds(p => p.filter(id => id !== group.groupId));
                                      else setSelectedGroupIds(p => [...p, group.groupId]);
                                    }}
                                    className={cn(
                                      "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs border transition-all",
                                      selected ? "bg-cugini-orange/10 border-cugini-orange/30 text-cugini-orange" : "bg-card/50 border-border text-muted-foreground hover:border-white/20"
                                    )}
                                  >
                                    <div className={cn("h-3 w-3 rounded border flex items-center justify-center", selected ? "bg-cugini-orange border-cugini-orange" : "border-muted-foreground/30")}>
                                      {selected && <Check className="h-2 w-2 text-white" />}
                                    </div>
                                    {group.name}
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
            <div className="px-5 py-3 border-t border-white/10 flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-border"
                onClick={() => setPublishVehicle(null)}
              >
                Cancelar
              </Button>
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
        <DialogContent showCloseButton={false} className="sm:max-w-2xl p-0 overflow-hidden bg-[#0A0A0C] ring-1 ring-white/10">
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
      <Dialog open={!!rejectVehicleId} onOpenChange={(open) => !open && setRejectVehicleId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Rejeitar veiculo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Motivo da rejeicao (opcional)
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Ex: Preco muito alto, fotos ruins, dados incompletos..."
                className="w-full h-24 rounded-lg bg-card border border-border p-3 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-destructive/50 focus:border-destructive/50"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 border-border"
                onClick={() => setRejectVehicleId(null)}
              >
                Cancelar
              </Button>
              <Button
                onClick={confirmReject}
                disabled={actionLoading === rejectVehicleId}
                className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 border-0"
              >
                {actionLoading === rejectVehicleId ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <X className="h-4 w-4 mr-1" />
                    Rejeitar
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Batch Publish Modal */}
      <Dialog open={showBatchModal} onOpenChange={(open) => !open && setShowBatchModal(false)}>
        <DialogContent showCloseButton={false} className="sm:max-w-2xl p-0 overflow-hidden bg-[#0D0D0D] ring-1 ring-white/10">
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
                          return (
                            <div key={region} className="border border-border rounded-xl overflow-hidden">
                              <button
                                onClick={() => toggleRegionById(region)}
                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
                              >
                                <div className={cn(
                                  "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                                  allSelected ? "bg-cugini-orange border-cugini-orange" : someSelected ? "bg-cugini-orange/50 border-cugini-orange" : "border-muted-foreground/30"
                                )}>
                                  {(allSelected || someSelected) && <Check className="h-2.5 w-2.5 text-white" />}
                                </div>
                                <span className="text-sm font-medium flex-1 text-left">{region}</span>
                                <span className="text-xs text-muted-foreground">{selectedCount}/{groups.length}</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setExpandedRegions(prev => { const n = new Set(prev); if (n.has(region)) n.delete(region); else n.add(region); return n; }); }}
                                  className="p-1 hover:bg-white/[0.05] rounded"
                                >
                                  <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                                </button>
                              </button>
                              {expanded && (
                                <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                                  {groups.map(group => {
                                    const selected = selectedGroupIds.includes(group.id);
                                    return (
                                      <button
                                        key={group.id}
                                        onClick={() => {
                                          if (selected) setSelectedGroupIds(p => p.filter(id => id !== group.id));
                                          else setSelectedGroupIds(p => [...p, group.id]);
                                        }}
                                        className={cn(
                                          "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs border transition-all",
                                          selected ? "bg-cugini-orange/10 border-cugini-orange/30 text-cugini-orange" : "bg-card/50 border-border text-muted-foreground hover:border-white/20"
                                        )}
                                      >
                                        <div className={cn("h-3 w-3 rounded border flex items-center justify-center", selected ? "bg-cugini-orange border-cugini-orange" : "border-muted-foreground/30")}>
                                          {selected && <Check className="h-2 w-2 text-white" />}
                                        </div>
                                        {group.name}
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
