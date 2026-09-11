"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PAPEIS, rotuloDoPapel } from "./tipos";
import type { Formulario } from "../_ganchos/use-formulario";

// ---------------------------------------------------------------------------
// Criar ou editar um usuario.
//
// O email fica travado na edicao: e a identidade de quem entra no sistema e
// aparece na trilha de auditoria. A senha em branco na edicao mantem a atual.
// ---------------------------------------------------------------------------

export function DialogoUsuario({ form }: { form: Formulario }) {
  const editando = !!form.editando;

  return (
    <Dialog open={form.aberto} onOpenChange={(open) => !open && form.setAberto(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar usuário" : "Novo usuário"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Nome</label>
            <Input
              value={form.campos.nome}
              onChange={(e) => form.alterar("nome", e.target.value)}
              placeholder="Nome completo"
              className="bg-card border-border"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Email</label>
            <Input
              type="email"
              value={form.campos.email}
              onChange={(e) => form.alterar("email", e.target.value)}
              placeholder="email@exemplo.com"
              disabled={editando}
              className="bg-card border-border"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Senha {editando && "(deixe vazio para manter)"}
            </label>
            <div className="relative">
              <Input
                type={form.mostrarSenha ? "text" : "password"}
                value={form.campos.senha}
                onChange={(e) => form.alterar("senha", e.target.value)}
                placeholder={editando ? "Nova senha (opcional)" : "Senha"}
                className="bg-card border-border pr-10"
              />
              <button
                type="button"
                onClick={() => form.setMostrarSenha(!form.mostrarSenha)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {form.mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Role</label>
            <div className="flex gap-2">
              {PAPEIS.map((papel) => (
                <button
                  key={papel}
                  onClick={() => form.alterar("papel", papel)}
                  className={cn(
                    "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all border",
                    form.campos.papel === papel
                      ? "bg-brand-gold/10 text-brand-gold border-brand-gold/30"
                      : "bg-card text-muted-foreground border-border hover:text-foreground"
                  )}
                >
                  {rotuloDoPapel(papel)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 border-border" onClick={() => form.setAberto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={form.salvar}
              disabled={form.salvando}
              className="flex-1 gradient-gold text-white border-0"
            >
              {form.salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : editando ? "Salvar" : "Criar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
