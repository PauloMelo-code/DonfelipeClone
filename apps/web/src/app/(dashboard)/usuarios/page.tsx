"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export default function UsuariosPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<"ADMIN" | "OPERATOR">("OPERATOR");
  const [showPassword, setShowPassword] = useState(false);

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
      toast.error("Nome e email sao obrigatorios");
      return;
    }
    if (!editingUser && !formPassword.trim()) {
      toast.error("Senha e obrigatoria para novos usuarios");
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
          toast.success("Usuario atualizado!");
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
          toast.success("Usuario criado!");
          setShowForm(false);
          fetchUsers();
        } else {
          const err = await res.json();
          toast.error(err.error || "Erro ao criar usuario");
        }
      }
    } catch {
      toast.error("Erro de conexao");
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
        toast.success(user.active ? "Usuario desativado" : "Usuario ativado");
        fetchUsers();
      } else {
        const err = await res.json();
        toast.error(err.error || "Erro ao alterar status");
      }
    } catch {
      toast.error("Erro de conexao");
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
      <Header title="Usuarios" subtitle="Gerenciamento de usuarios do sistema" />

      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {users.length} usuario(s)
          </p>
          <Button
            size="sm"
            onClick={openCreate}
            className="gap-1.5 gradient-orange text-white border-0"
          >
            <Plus className="h-4 w-4" />
            Novo usuario
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-cugini-orange" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <UserCog className="mb-3 h-12 w-12 opacity-20" />
            <p className="text-sm">Nenhum usuario cadastrado</p>
          </div>
        ) : (
          <div className="glass rounded-2xl overflow-hidden">
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-white/[0.04]">
              <AnimatePresence>
                {users.map((user, i) => (
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
                        <Badge className={cn("border text-[10px]",
                          user.active
                            ? "bg-success/10 text-success border-success/20"
                            : "bg-destructive/10 text-destructive border-destructive/20"
                        )}>
                          {user.active ? "Ativo" : "Inativo"}
                        </Badge>
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
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Usuario</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Role</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Status</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Acoes</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Criado em</th>
                    <th className="px-5 py-3.5 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {users.map((user, i) => (
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
                          <Badge className={cn("border",
                            user.active
                              ? "bg-success/10 text-success border-success/20"
                              : "bg-destructive/10 text-destructive border-destructive/20"
                          )}>
                            {user.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground">{user._count.auditLogs} acoes</td>
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
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => !open && setShowForm(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? "Editar usuario" : "Novo usuario"}
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
