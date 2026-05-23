"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageContainer } from "@/components/ui/page-container";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MessageSquare,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Template {
  id: string;
  name: string;
  content: string;
  category: string | null;
  shortcut: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formShortcut, setFormShortcut] = useState("");

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/templates");
      if (res.ok) {
        setTemplates(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    templates.forEach((t) => {
      if (t.category) set.add(t.category);
    });
    return Array.from(set).sort();
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    if (!activeCategory) return templates;
    return templates.filter((t) => t.category === activeCategory);
  }, [templates, activeCategory]);

  const openCreate = () => {
    setEditing(null);
    setFormName("");
    setFormContent("");
    setFormCategory("");
    setFormShortcut("");
    setShowForm(true);
  };

  const openEdit = (t: Template) => {
    setEditing(t);
    setFormName(t.name);
    setFormContent(t.content);
    setFormCategory(t.category ?? "");
    setFormShortcut(t.shortcut ?? "");
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formName.trim() || !formContent.trim()) {
      toast.error("Nome e conteúdo são obrigatórios");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: formName.trim(),
        content: formContent.trim(),
        category: formCategory.trim() || null,
        shortcut: formShortcut.trim() || null,
      };
      const url = editing ? `/api/templates/${editing.id}` : "/api/templates";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success(editing ? "Template atualizado!" : "Template criado!");
        setShowForm(false);
        fetchTemplates();
      } else {
        const err = await res.json().catch(() => ({ error: "Erro" }));
        toast.error(err.error || "Erro ao salvar");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: Template) => {
    if (!confirm(`Excluir template "${t.name}"?`)) return;
    try {
      const res = await fetch(`/api/templates/${t.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Template removido");
        fetchTemplates();
      } else {
        toast.error("Erro ao excluir");
      }
    } catch {
      toast.error("Erro de conexão");
    }
  };

  const handleCopy = async (t: Template) => {
    try {
      await navigator.clipboard.writeText(t.content);
      setCopiedId(t.id);
      toast.success("Copiado!");
      setTimeout(() => setCopiedId((id) => (id === t.id ? null : id)), 1500);
    } catch {
      toast.error("Falha ao copiar");
    }
  };

  return (
    <>
      <Header title="Templates" subtitle="Mensagens prontas para WhatsApp" />

      <PageContainer>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-muted-foreground">
            {templates.length} template(s)
          </p>
          <Button
            size="sm"
            onClick={openCreate}
            className="gap-1.5 gradient-orange text-white border-0"
          >
            <Plus className="h-4 w-4" />
            Novo template
          </Button>
        </div>

        {/* Category filter */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveCategory(null)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                activeCategory === null
                  ? "bg-cugini-orange/10 text-cugini-orange border-cugini-orange/30"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              )}
            >
              Todos
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                  activeCategory === cat
                    ? "bg-cugini-orange/10 text-cugini-orange border-cugini-orange/30"
                    : "bg-card text-muted-foreground border-border hover:text-foreground"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-cugini-orange" />
          </div>
        ) : filteredTemplates.length === 0 ? (
          <EmptyState
            icon={<MessageSquare />}
            title={templates.length === 0 ? "Nenhum template cadastrado" : "Nenhum template nesta categoria"}
            description={templates.length === 0 ? "Crie templates para enviar mensagens prontas no WhatsApp." : "Tente outra categoria ou crie um novo template."}
            actionLabel={templates.length === 0 ? "Novo template" : undefined}
            onAction={templates.length === 0 ? openCreate : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <AnimatePresence>
              {filteredTemplates.map((t, i) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="glass rounded-2xl p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {t.name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {t.category && (
                          <Badge className="border bg-cugini-orange/10 text-cugini-orange border-cugini-orange/20 text-[10px]">
                            {t.category}
                          </Badge>
                        )}
                        {t.shortcut && (
                          <Badge className="border bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]">
                            /{t.shortcut}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => handleCopy(t)}
                        className="rounded-lg p-2 text-muted-foreground hover:text-cugini-orange hover:bg-cugini-orange/10 transition-colors"
                        title="Copiar"
                      >
                        {copiedId === t.id ? (
                          <Check className="h-4 w-4 text-success" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => openEdit(t)}
                        className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(t)}
                        className="rounded-lg p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">
                    {t.content}
                  </p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </PageContainer>

      <Dialog open={showForm} onOpenChange={(open) => !open && setShowForm(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar template" : "Novo template"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Nome</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Saudação inicial"
                maxLength={100}
                className="bg-card border-border"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Conteúdo
              </label>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Olá! Como posso ajudar?"
                maxLength={2000}
                className="bg-card border-border min-h-[120px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Categoria
                </label>
                <Input
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="vendas"
                  maxLength={50}
                  className="bg-card border-border"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Atalho
                </label>
                <Input
                  value={formShortcut}
                  onChange={(e) => setFormShortcut(e.target.value)}
                  placeholder="ola"
                  maxLength={20}
                  className="bg-card border-border"
                />
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
                ) : editing ? (
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
