"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Send,
  Search,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Loader2,
  Car,
  ExternalLink,
  User,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageContainer } from "@/components/ui/page-container";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";

interface PostRecord {
  id: string;
  vehicleId: string;
  vehicleHash: string;
  targetGroupId: string;
  postedAt: string;
  messageId: string | null;
  success: boolean;
  errorMessage: string | null;
  vehicle: {
    id: string;
    model: string;
    brand: string | null;
    year: number;
    km: number;
    price: number;
    sellingPrice: number | null;
    photos: string;
    formattedAd: string | null;
  };
  targetGroup: {
    groupId: string;
    name: string;
  };
  user: { id: string; name: string; email: string } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function PublicacoesPage() {
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchPosts = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (searchDebounced) params.set("search", searchDebounced);

      const res = await fetch(`/api/publications?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
        setPagination(data.pagination);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchDebounced]);

  useEffect(() => {
    fetchPosts(1);
  }, [fetchPosts]);

  // Auto-refresh: pega novas publicacoes em background a cada 15s.
  // So roda quando esta na pagina 1 sem busca -- evita rebobinar a paginacao.
  // Pausa quando a aba esta oculta pra economizar.
  useEffect(() => {
    if (pagination.page !== 1 || searchDebounced) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval) return;
      interval = setInterval(() => fetchPosts(1), 15_000);
    };
    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pagination.page, searchDebounced, fetchPosts]);

  const formatPrice = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      <Header title="Publicações" subtitle="Histórico de publicações realizadas" />

      <PageContainer>
        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
            <TabsList className="glass">
              <TabsTrigger value="all">
                Todas
              </TabsTrigger>
              <TabsTrigger value="success" className="data-[state=active]:bg-success/10 data-[state=active]:text-success">
                Sucesso
              </TabsTrigger>
              <TabsTrigger value="failed" className="data-[state=active]:bg-destructive/10 data-[state=active]:text-destructive">
                Falhas
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar veículo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card border-border"
            />
          </div>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{pagination.total} publicação(ões) encontrada(s)</span>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-cugini-orange" />
          </div>
        ) : posts.length === 0 ? (
          <EmptyState
            icon={<Send />}
            title="Nenhuma publicação encontrada"
            description={searchDebounced || statusFilter !== "all" ? "Tente ajustar os filtros." : "Publicações realizadas aparecerão aqui."}
          />
        ) : (
          <div className="glass rounded-2xl overflow-hidden">
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-white/[0.04]">
              {posts.map((post, i) => {
                const photos = JSON.parse(post.vehicle.photos || "[]");
                const isExpanded = expandedId === post.id;
                return (
                  <motion.div
                    key={post.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : post.id)}
                    >
                      <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-card">
                        {photos.length > 0 ? (
                          <img src={photos[0]} alt={post.vehicle.model} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Car className="h-5 w-5 text-muted-foreground/30" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground line-clamp-2">
                          {post.vehicle.brand && !post.vehicle.model.toUpperCase().startsWith(post.vehicle.brand.toUpperCase()) ? `${post.vehicle.brand} ` : ""}{post.vehicle.model}
                        </p>
                        <p className="text-xs text-muted-foreground">{post.vehicle.year} · {post.vehicle.km.toLocaleString("pt-BR")} km</p>
                        <p className="text-sm font-semibold text-cugini-orange mt-0.5">
                          {formatPrice(post.vehicle.sellingPrice || post.vehicle.price)}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <ExternalLink className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                          <span className="text-xs text-muted-foreground line-clamp-1">{post.targetGroup.name}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <StatusBadge
                          kind={post.success ? "success" : "failed"}
                          size="xs"
                          icon={post.success ? <CheckCircle2 /> : <XCircle />}
                        />
                        <span className="text-[11px] text-muted-foreground/50">{formatDate(post.postedAt)}</span>
                        <ChevronDown className={cn("h-4 w-4 text-muted-foreground/40 transition-transform", isExpanded && "rotate-180")} />
                      </div>
                    </div>
                    {isExpanded && (
                      <PublicationExpand post={post} />
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.04] text-left">
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Veículo</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Grupo Destino</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Usuário</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Data</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Preço</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50 text-center">Status</th>
                    <th className="px-5 py-3.5 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((post, i) => {
                    const photos = JSON.parse(post.vehicle.photos || "[]");
                    const isExpanded = expandedId === post.id;
                    return (
                      <motion.tr
                        key={post.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className={cn("border-b border-white/[0.03] transition-colors duration-200 cursor-pointer", isExpanded ? "bg-white/[0.02]" : "hover:bg-white/[0.02]")}
                        onClick={() => setExpandedId(isExpanded ? null : post.id)}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-card">
                              {photos.length > 0 ? (
                                <img src={photos[0]} alt={post.vehicle.model} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center">
                                  <Car className="h-4 w-4 text-muted-foreground/30" />
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-foreground">
                                {post.vehicle.brand && !post.vehicle.model.toUpperCase().startsWith(post.vehicle.brand.toUpperCase()) ? `${post.vehicle.brand} ` : ""}{post.vehicle.model}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {post.vehicle.year} &middot; {post.vehicle.km.toLocaleString("pt-BR")} km
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-foreground truncate max-w-[180px]">{post.targetGroup.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          {post.user ? (
                            <div>
                              <p className="text-foreground text-[13px]">{post.user.name}</p>
                              <p className="text-[10px] text-muted-foreground">{post.user.email}</p>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">Sistema</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">{formatDate(post.postedAt)}</td>
                        <td className="px-5 py-3.5">
                          <span className="font-medium text-cugini-orange">
                            {formatPrice(post.vehicle.sellingPrice || post.vehicle.price)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {post.success ? (
                            <StatusBadge kind="success" icon={<CheckCircle2 />} />
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <StatusBadge kind="failed" icon={<XCircle />} />
                              {post.errorMessage && (
                                <span
                                  className="text-[10px] text-destructive/70 max-w-[180px] truncate cursor-help"
                                  title={post.errorMessage}
                                >
                                  {post.errorMessage}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground/50 transition-transform", isExpanded && "rotate-180")} />
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Expansao desktop -- fora da tabela pra ocupar largura toda */}
              {expandedId && (() => {
                const post = posts.find((p) => p.id === expandedId);
                if (!post) return null;
                return (
                  <div className="px-5 py-4 bg-card/40 border-t border-white/[0.04]">
                    <PublicationExpand post={post} />
                  </div>
                );
              })()}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-white/[0.04] px-5 py-3.5">
                <span className="text-xs text-muted-foreground">
                  Página {pagination.page} de {pagination.totalPages}
                </span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={pagination.page <= 1}
                    onClick={() => fetchPosts(pagination.page - 1)} className="h-8 w-8 p-0 border-border">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages}
                    onClick={() => fetchPosts(pagination.page + 1)} className="h-8 w-8 p-0 border-border">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </PageContainer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Expansao da publicacao -- mostra anuncio formatado + quem enviou
// ---------------------------------------------------------------------------
function PublicationExpand({ post }: { post: PostRecord }) {
  const photos: string[] = (() => {
    try { return JSON.parse(post.vehicle.photos || "[]"); } catch { return []; }
  })();
  const adText = post.vehicle.formattedAd || "(sem texto formatado salvo)";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Coluna 1-2: Anúncio publicado */}
      <div className="lg:col-span-2 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
          Anúncio publicado
        </p>
        <div className="rounded-xl overflow-hidden ring-1 ring-white/[0.06]">
          <div className="bg-[#1F2C34] px-3 py-2 flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-[#2A3942] flex items-center justify-center">
              <MessageCircle className="h-3.5 w-3.5 text-[#8696A0]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#E9EDEF] truncate">{post.targetGroup.name}</p>
              <p className="text-[10px] text-[#8696A0]">como apareceu no WhatsApp</p>
            </div>
          </div>
          <div
            className="p-3 max-h-[400px] overflow-y-auto"
            style={{
              backgroundColor: "#0B141A",
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          >
            <div className="max-w-[90%] ml-auto">
              <div className="bg-[#005C4B] rounded-lg overflow-hidden shadow-lg">
                {photos[0] && (
                  <img src={photos[0]} alt="" className="w-full h-36 object-cover" />
                )}
                <div className="px-2.5 py-1.5">
                  <p className="text-[12px] text-[#E9EDEF] whitespace-pre-wrap leading-[18px]">
                    {adText}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Coluna 3: metadados */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
          Detalhes do envio
        </p>
        <div className="rounded-lg border border-white/[0.06] bg-background/40 p-3 space-y-2.5">
          {/* Usuário */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-0.5">Enviado por</p>
            {post.user ? (
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cugini-orange/15 text-[11px] font-semibold text-cugini-orange shrink-0">
                  {post.user.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{post.user.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{post.user.email}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground shrink-0">
                  <User className="h-3.5 w-3.5" />
                </div>
                <p className="text-sm text-muted-foreground">Sistema (automático)</p>
              </div>
            )}
          </div>

          {/* Status */}
          <div className="pt-2 border-t border-white/[0.04]">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Resultado</p>
            {post.success ? (
              <p className="text-sm text-success">✓ Enviado com sucesso</p>
            ) : (
              <div>
                <p className="text-sm text-destructive">✕ Falha no envio</p>
                {post.errorMessage && (
                  <p className="text-[11px] text-destructive/70 mt-0.5 break-words">{post.errorMessage}</p>
                )}
              </div>
            )}
          </div>

          {/* IDs técnicos */}
          {post.messageId && (
            <div className="pt-2 border-t border-white/[0.04]">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-0.5">Message ID</p>
              <p className="text-[11px] text-muted-foreground font-mono break-all">{post.messageId}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
