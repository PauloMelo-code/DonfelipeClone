"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  UserCog,
  Plus,
  Loader2,
  Shield,
  Eye,
  EyeOff,
  Pencil,
  Power,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
  _count: { auditLogs: number };
}

const PAGE_SIZE = 15;

export default function UsuariosPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);

  // Form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<"ADMIN" | "OPERATOR">("OPERATOR");
  const [showPassword, setShowPassword] = useState(false);

  // Ordena: ATIVOS primeiro (sempre no topo), depois por nome.
  // Aplica busca e filtro de status. Pagina client-side.
  const filteredUsers = useMemo(() => {
    const s = search.trim().toLowerCase();
    return users
      .filter((u) => {
        if (statusFilter === "active" && !u.active) return false;
        if (statusFilter === "inactive" && u.active) return false;
        if (!s) return true;
        return u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s);
      })
      .sort((a, b) => {
        // Ativos sempre antes de inativos
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.name.localeCompare(b.name, "pt-BR");
      });
  }, [users, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedUsers = useMemo(
    () => filteredUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredUsers, currentPage]
  );

  // Reseta pagina ao filtrar/buscar
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const activeCount = useMemo(() => users.filter((u) => u.active).length, [users]);
  const inactiveCount = users.length - activeCount;

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        setUsers(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const openCreate = () => {
    setEditingUser(null);
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormRole("OPERATOR");
    setShowPassword(false);
    setShowForm(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setFormName(user.name);
    setFormEmail(user.email);
    setFormPassword("");
    setFormRole(user.role as "ADMIN" | "OPERATOR");
    setShowPassword(false);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formName.trim() || !formEmail.trim()) {
      toast.error("Nome e email são obrigatórios");
      return;
    }
    if (!editingUser && !formPassword.trim()) {
      toast.error("Senha é obrigatória para novos usuários");
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        const body: Record<string, string> = { name: formName, role: formRole };
        if (formPassword.trim()) body.password = formPassword;
        const res = await fetch(`/api/users/${editingUser.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          toast.success("Usuário atualizado!");
          setShowForm(false);
          fetchUsers();
        } else {
          const err = await res.json();
          toast.error(err.error || "Erro ao atualizar");
        }
      } else {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName,
            email: formEmail,
            password: formPassword,
            role: formRole,
          }),
        });
        if (res.ok) {
          toast.success("Usuário criado!");
          setShowForm(false);
          fetchUsers();
        } else {
          const err = await res.json();
          toast.error(err.error || "Erro ao criar usuário");
        }
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (user: User) => {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !user.active }),
      });
      if (res.ok) {
        toast.success(user.active ? "Usuário desativado" : "Usuário ativado");
        fetchUsers();
      } else {
        const err = await res.json();
        toast.error(err.error || "Erro ao alterar status");
      }
    } catch {
      toast.error("Erro de conexão");
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });

  return (
    <>
      <Header title="Usuários" subtitle="Gerenciamento de usuários do sistema" />

      <PageContainer>
        {/* Header: count + actions */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-foreground font-medium tabular-nums">
              {users.length}
            </span>
            <span className="text-muted-foreground/60">
              {users.length === 1 ? "usuário" : "usuários"}
            </span>
            {activeCount > 0 && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
                  <span className="text-success tabular-nums">{activeCount}</span>
                  <span className="text-muted-foreground/60">ativos</span>
                </span>
              </>
            )}
            {inactiveCount > 0 && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                  <span className="text-muted-foreground tabular-nums">{inactiveCount}</span>
                  <span className="text-muted-foreground/60">inativos</span>
                </span>
              </>
            )}
          </div>
          <Button
            size="sm"
            onClick={openCreate}
            className="gap-1.5 gradient-orange text-white border-0 hover:shadow-[0_4px_20px_rgba(232,115,26,0.3)] transition-all"
          >
            <Plus className="h-4 w-4" />
            Novo usuário
          </Button>
        </div>

        {/* Filters: search + status */}
        {users.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-card/50 border-white/[0.06] focus:border-cugini-orange/40"
              />
            </div>
            <div className="flex gap-1 rounded-lg border border-white/[0.06] bg-card/40 p-0.5">
              {([
                { id: "all", label: "Todos" },
                { id: "active", label: "Ativos" },
                { id: "inactive", label: "Inativos" },
              ] as const).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                    statusFilter === f.id
                      ? "bg-cugini-orange/15 text-cugini-orange"
                      : "text-muted-foreground/70 hover:text-foreground"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-cugini-orange" />
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            icon={<UserCog />}
            title="Nenhum usuário cadastrado"
            description="Adicione operadores ou administradores para acessar o sistema."
            actionLabel="Novo usuário"
            onAction={openCreate}
          />
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            icon={<Search />}
            title="Nenhum usuário encontrado"
            description={search ? `Nenhum resultado para "${search}".` : `Sem usuários ${statusFilter === "active" ? "ativos" : "inativos"} no momento.`}
          />
        ) : (
          <div className="glass rounded-2xl overflow-hidden">
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-white/[0.04]">
              <AnimatePresence>
                {paginatedUsers.map((user, i) => (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cugini-orange/[0.08] text-[13px] font-semibold text-cugini-orange">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Badge className={cn("border text-[10px]",
                          user.role === "ADMIN"
                            ? "bg-cugini-orange/10 text-cugini-orange border-cugini-orange/20"
                            : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                        )}>
                          <Shield className="h-2.5 w-2.5 mr-1" />
                          {user.role === "ADMIN" ? "Admin" : "Operador"}
                        </Badge>
                        <StatusBadge kind={user.active ? "active" : "inactive"} size="xs" />
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openEdit(user)}
                        className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => toggleActive(user)}
                        className={cn("rounded-lg p-2 transition-colors",
                          user.active
                            ? "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            : "text-muted-foreground hover:text-success hover:bg-success/10"
                        )}>
                        <Power className="h-4 w-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.04] text-left">
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Usuário</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Role</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Status</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Ações</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Criado em</th>
                    <th className="px-5 py-3.5 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {paginatedUsers.map((user, i) => (
                      <motion.tr
                        key={user.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors duration-200"
                      >
                        <td className="px-5 py-3.5">
                          <div>
                            <p className="font-medium text-foreground">{user.name}</p>
                            <p className="text-[11px] text-muted-foreground">{user.email}</p>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge className={cn("border",
                            user.role === "ADMIN"
                              ? "bg-cugini-orange/10 text-cugini-orange border-cugini-orange/20"
                              : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                          )}>
                            <Shield className="h-3 w-3 mr-1" />
                            {user.role === "ADMIN" ? "Admin" : "Operador"}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge kind={user.active ? "active" : "inactive"} />
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground">{user._count.auditLogs} ações</td>
                        <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">{formatDate(user.createdAt)}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex gap-1">
                            <button onClick={() => openEdit(user)}
                              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Editar">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={() => toggleActive(user)}
                              className={cn("rounded-lg p-1.5 transition-colors",
                                user.active
                                  ? "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  : "text-muted-foreground hover:text-success hover:bg-success/10"
                              )} title={user.active ? "Desativar" : "Ativar"}>
                              <Power className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-white/[0.04] px-5 py-3.5">
                <span className="text-xs text-muted-foreground tabular-nums">
                  Mostrando <span className="text-foreground font-medium">{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredUsers.length)}</span> de <span className="text-foreground font-medium">{filteredUsers.length}</span>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-white/[0.06] bg-card/40 text-muted-foreground transition-colors hover:text-foreground hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-3 text-xs font-medium text-foreground tabular-nums">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-white/[0.06] bg-card/40 text-muted-foreground transition-colors hover:text-foreground hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Próxima página"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </PageContainer>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => !open && setShowForm(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? "Editar usuário" : "Novo usuário"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Nome</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Nome completo"
                className="bg-card border-border"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Email</label>
              <Input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="email@exemplo.com"
                disabled={!!editingUser}
                className="bg-card border-border"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Senha {editingUser && "(deixe vazio para manter)"}
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder={editingUser ? "Nova senha (opcional)" : "Senha"}
                  className="bg-card border-border pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Role</label>
              <div className="flex gap-2">
                {(["OPERATOR", "ADMIN"] as const).map((role) => (
                  <button
                    key={role}
                    onClick={() => setFormRole(role)}
                    className={cn(
                      "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all border",
                      formRole === role
                        ? "bg-cugini-orange/10 text-cugini-orange border-cugini-orange/30"
                        : "bg-card text-muted-foreground border-border hover:text-foreground"
                    )}
                  >
                    {role === "ADMIN" ? "Admin" : "Operador"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1 border-border"
                onClick={() => setShowForm(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 gradient-orange text-white border-0"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : editingUser ? (
                  "Salvar"
                ) : (
                  "Criar"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
