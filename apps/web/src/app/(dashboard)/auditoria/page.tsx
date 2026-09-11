"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { motion } from "framer-motion";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { EmptyState } from "@/components/ui/empty-state";
import { AuditVehicleDetail } from "@/components/vehicles/audit-vehicle-detail";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Shield,
  User,
  Car,
  Settings,
  Send,
  Eye,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AuditLog {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: string | null;
  userId: string | null;
  vehicleId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
  vehicle: { id: string; model: string; brand: string | null } | null;
}

// Resumo legivel do User-Agent (mesma logica do lib/request-meta.ts)
function summarizeUA(ua: string | null | undefined): string {
  if (!ua) return "Desconhecido";
  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Edg/i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  const verMatch = ua.match(/(?:Edg|Chrome|Firefox|Safari|OPR)\/(\d+)/i);
  const browserVer = verMatch?.[1];
  let os = "Desconhecido";
  let device: string | null = null;
  if (/Android/i.test(ua)) {
    const m = ua.match(/Android (\d+(?:\.\d+)?)/);
    os = m ? `Android ${m[1]}` : "Android";
    const dm = ua.match(/Android.*?;\s*([^)]+?)(?:\s*Build|\))/i);
    if (dm && dm[1] && !/Linux|wv/i.test(dm[1])) {
      device = dm[1].trim().split(";").pop()?.trim() || null;
    }
  } else if (/iPhone/i.test(ua)) { device = "iPhone"; os = "iOS"; }
  else if (/iPad/i.test(ua)) { device = "iPad"; os = "iPadOS"; }
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/Windows NT 10/i.test(ua)) os = "Windows 10/11";
  else if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Linux/i.test(ua)) os = "Linux";
  const browserPart = browserVer ? `${browser} ${browserVer}` : browser;
  return device ? `${browserPart} · ${device} · ${os}` : `${browserPart} · ${os}`;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const actionConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  VEHICLE_CAPTURED: { label: "Capturado", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: Car },
  VEHICLE_APPROVED: { label: "Aprovado", color: "bg-success/10 text-success border-success/20", icon: Eye },
  VEHICLE_REJECTED: { label: "Rejeitado", color: "bg-destructive/10 text-destructive border-destructive/20", icon: X },
  VEHICLE_PUBLISH: { label: "Publicado", color: "bg-brand-gold/10 text-brand-gold border-brand-gold/20", icon: Send },
  VEHICLE_PUBLISHED: { label: "Publicado", color: "bg-brand-gold/10 text-brand-gold border-brand-gold/20", icon: Send },
  SETTINGS_UPDATED: { label: "Config", color: "bg-warning/10 text-warning border-warning/20", icon: Settings },
  USER_CREATED: { label: "Novo Usuário", color: "bg-purple-500/10 text-purple-400 border-purple-500/20", icon: User },
  USER_UPDATED: { label: "Usuário Editado", color: "bg-purple-500/10 text-purple-400 border-purple-500/20", icon: User },
};

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 20, total: 0, totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchLogs = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (actionFilter) params.set("action", actionFilter);
      if (searchDebounced) params.set("search", searchDebounced);

      const res = await fetch(`/api/audit-logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setPagination(data.pagination);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [actionFilter, searchDebounced]);

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });

  const parseDetails = (details: string | null) => {
    if (!details) return null;
    try { return JSON.parse(details); } catch { return null; }
  };

  const actions = [
    "", "VEHICLE_CAPTURED", "VEHICLE_APPROVED", "VEHICLE_REJECTED",
    "VEHICLE_PUBLISH", "SETTINGS_UPDATED", "USER_CREATED", "USER_UPDATED",
  ];

  return (
    <>
      <Header title="Análise" subtitle="Detalhes e auditoria das ações do sistema" />

      <PageContainer>
        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {actions.map((a) => {
              const config = a ? actionConfig[a] : null;
              return (
                <button
                  key={a || "all"}
                  onClick={() => setActionFilter(a)}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all border",
                    actionFilter === a
                      ? "bg-brand-gold/10 text-brand-gold border-brand-gold/30"
                      : "bg-card/50 text-muted-foreground border-border hover:text-foreground"
                  )}
                >
                  {a ? config?.label || a : "Todas"}
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar nos detalhes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card border-border"
            />
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          {pagination.total} registro(s)
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-brand-gold" />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={<Shield />}
            title="Nenhum registro encontrado"
            description={searchDebounced || actionFilter ? "Tente ajustar os filtros acima." : "As ações do sistema aparecerão aqui conforme acontecerem."}
          />
        ) : (
          <div className="glass rounded-2xl overflow-hidden">
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-white/[0.04]">
              {logs.map((log, i) => {
                const config = actionConfig[log.action];
                const Icon = config?.icon || Shield;
                const details = parseDetails(log.details);
                const isExpanded = expandedId === log.id;
                return (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                  >
                    <div
                      className={cn("flex items-center gap-3 px-4 py-3 cursor-pointer", isExpanded && "bg-white/[0.02]")}
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge className={cn("gap-1 border text-[10px]", config?.color || "bg-card text-foreground border-border")}>
                            <Icon className="h-2.5 w-2.5" />{config?.label || log.action}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          {log.user ? log.user.name : <span className="text-muted-foreground text-xs">Sistema</span>}
                        </p>
                        {(log.vehicle || log.entityType) && (
                          <p className="text-xs text-muted-foreground truncate">
                            {log.vehicle ? `${log.vehicle.brand ? log.vehicle.brand + " " : ""}${log.vehicle.model}` : log.entityType}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[10px] text-muted-foreground">{formatDate(log.createdAt)}</span>
                        {(details || log.vehicleId) && (
                          <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
                        )}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="px-4 pb-3 bg-card/50 space-y-3">
                        {log.vehicleId && (
                          <AuditVehicleDetail vehicleId={log.vehicleId} />
                        )}
                        {(log.ipAddress || log.userAgent) && (
                          <AuditRequestMeta ip={log.ipAddress} ua={log.userAgent} />
                        )}
                        {details && (
                          <details className="rounded-lg bg-background/50">
                            <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60 px-3 py-2">
                              Detalhes técnicos (JSON)
                            </summary>
                            <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono px-3 pb-3 max-h-40 overflow-auto">
                              {JSON.stringify(details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
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
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Ação</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Usuário</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Entidade</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Data</th>
                    <th className="px-5 py-3.5 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => {
                    const config = actionConfig[log.action];
                    const Icon = config?.icon || Shield;
                    const details = parseDetails(log.details);
                    const isExpanded = expandedId === log.id;
                    const canExpand = !!(details || log.vehicleId);
                    return (
                      <Fragment key={log.id}>
                        <motion.tr
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className={cn("border-b border-white/[0.03] transition-colors duration-200 cursor-pointer", isExpanded ? "bg-white/[0.02]" : "hover:bg-white/[0.02]")}
                          onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        >
                          <td className="px-5 py-3.5">
                            <Badge className={cn("gap-1 border", config?.color || "bg-card text-foreground border-border")}>
                              <Icon className="h-3 w-3" />{config?.label || log.action}
                            </Badge>
                          </td>
                          <td className="px-5 py-3.5">
                            {log.user ? (
                              <div>
                                <p className="font-medium text-foreground">{log.user.name}</p>
                                <p className="text-[11px] text-muted-foreground">{log.user.email}</p>
                              </div>
                            ) : <span className="text-muted-foreground text-xs">Sistema</span>}
                          </td>
                          <td className="px-5 py-3.5">
                            {log.vehicle ? (
                              <span className="text-foreground">{log.vehicle.brand && `${log.vehicle.brand} `}{log.vehicle.model}</span>
                            ) : log.entityType ? (
                              <span className="text-muted-foreground">{log.entityType}</span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">{formatDate(log.createdAt)}</td>
                          <td className="px-5 py-3.5">
                            {canExpand && <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />}
                          </td>
                        </motion.tr>
                        {/* Linha de expansao INLINE -- logo abaixo da clicada */}
                        {isExpanded && canExpand && (
                          <tr className="bg-card/40 border-b border-white/[0.04]">
                            <td colSpan={5} className="px-5 py-4">
                              <div className="space-y-4">
                                {log.vehicleId && (
                                  <AuditVehicleDetail vehicleId={log.vehicleId} />
                                )}
                                {(log.ipAddress || log.userAgent) && (
                                  <AuditRequestMeta ip={log.ipAddress} ua={log.userAgent} />
                                )}
                                {details && (
                                  <details className="rounded-lg border border-white/[0.04] bg-background/40">
                                    <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60 px-3 py-2 select-none">
                                      Detalhes técnicos (JSON)
                                    </summary>
                                    <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono px-3 pb-3 max-h-40 overflow-auto">
                                      {JSON.stringify(details, null, 2)}
                                    </pre>
                                  </details>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-white/[0.04] px-5 py-3.5">
                <span className="text-xs text-muted-foreground">Página {pagination.page} de {pagination.totalPages}</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={pagination.page <= 1}
                    onClick={() => fetchLogs(pagination.page - 1)} className="h-8 w-8 p-0 border-border">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages}
                    onClick={() => fetchLogs(pagination.page + 1)} className="h-8 w-8 p-0 border-border">
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

// Bloco com info do dispositivo/IP que realizou a acao
function AuditRequestMeta({ ip, ua }: { ip: string | null; ua: string | null }) {
  const summary = summarizeUA(ua);
  return (
    <div className="rounded-lg border border-white/[0.04] bg-background/40 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60 mb-2">
        Origem da ação
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50">Dispositivo</p>
          <p className="text-foreground">{summary}</p>
        </div>
        {ip && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50">IP</p>
            <p className="text-foreground font-mono text-xs">{ip}</p>
          </div>
        )}
      </div>
      {ua && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] text-muted-foreground/50 hover:text-muted-foreground select-none">
            User-Agent completo
          </summary>
          <p className="mt-1 text-[10px] text-muted-foreground/70 font-mono break-all">{ua}</p>
        </details>
      )}
    </div>
  );
}
