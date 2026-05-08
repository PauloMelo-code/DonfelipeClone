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
  Loader2,
  Car,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  };
  targetGroup: {
    groupId: string;
    name: string;
  };
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
      <Header title="Publicacoes" subtitle="Historico de publicacoes realizadas" />

      <div className="p-6 space-y-4">
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
              placeholder="Buscar veiculo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card border-border"
            />
          </div>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{pagination.total} publicacao(oes) encontrada(s)</span>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-cugini-orange" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Send className="mb-3 h-12 w-12 opacity-20" />
            <p className="text-sm">Nenhuma publicacao encontrada</p>
          </div>
        ) : (
          <div className="glass rounded-2xl overflow-hidden">
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-white/[0.04]">
              {posts.map((post, i) => {
                const photos = JSON.parse(post.vehicle.photos || "[]");
                return (
                  <motion.div
                    key={post.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-3 px-4 py-3"
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
                        {post.vehicle.brand && `${post.vehicle.brand} `}{post.vehicle.model}
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
                      {post.success ? (
                        <Badge className="gap-1 border bg-success/10 text-success border-success/20 text-[10px]">
                          <CheckCircle2 className="h-3 w-3" />Enviado
                        </Badge>
                      ) : (
                        <Badge className="gap-1 border bg-destructive/10 text-destructive border-destructive/20 text-[10px]">
                          <XCircle className="h-3 w-3" />Falha
                        </Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground/50">{formatDate(post.postedAt)}</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.04] text-left">
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Veiculo</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Grupo Destino</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Data</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Preco</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((post, i) => {
                    const photos = JSON.parse(post.vehicle.photos || "[]");
                    return (
                      <motion.tr
                        key={post.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors duration-200"
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
                                {post.vehicle.brand && `${post.vehicle.brand} `}{post.vehicle.model}
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
                        <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">{formatDate(post.postedAt)}</td>
                        <td className="px-5 py-3.5">
                          <span className="font-medium text-cugini-orange">
                            {formatPrice(post.vehicle.sellingPrice || post.vehicle.price)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {post.success ? (
                            <Badge className="gap-1 border bg-success/10 text-success border-success/20">
                              <CheckCircle2 className="h-3 w-3" />Enviado
                            </Badge>
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <Badge className="gap-1 border bg-destructive/10 text-destructive border-destructive/20">
                                <XCircle className="h-3 w-3" />Falha
                              </Badge>
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
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-white/[0.04] px-5 py-3.5">
                <span className="text-xs text-muted-foreground">
                  Pagina {pagination.page} de {pagination.totalPages}
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
      </div>
    </>
  );
}
