"use client";

import { Pencil, Power, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CORES_DO_PAPEL, rotuloDoPapel, type User } from "./tipos";

// ---------------------------------------------------------------------------
// As pecas que celular e desktop compartilham.
//
// A lista e desenhada duas vezes -- cards no celular, tabela no desktop --
// mas o selo do papel e os botoes de acao sao os mesmos nos dois lugares.
// ---------------------------------------------------------------------------

export function SeloDePapel({ papel, compacto }: { papel: string; compacto?: boolean }) {
  return (
    <Badge className={cn("border", compacto && "text-[10px]", CORES_DO_PAPEL[papel] ?? CORES_DO_PAPEL.OPERATOR)}>
      <Shield className={cn("mr-1", compacto ? "h-2.5 w-2.5" : "h-3 w-3")} />
      {rotuloDoPapel(papel)}
    </Badge>
  );
}

interface AcoesProps {
  user: User;
  aoEditar: (u: User) => void;
  aoAlternar: (u: User) => void;
  compacto?: boolean;
}

export function AcoesDoUsuario({ user, aoEditar, aoAlternar, compacto }: AcoesProps) {
  const padding = compacto ? "p-2" : "p-1.5";
  return (
    <div className="flex gap-1 shrink-0">
      <button
        onClick={() => aoEditar(user)}
        className={cn("rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors", padding)}
        title="Editar"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        onClick={() => aoAlternar(user)}
        className={cn(
          "rounded-lg transition-colors", padding,
          user.active
            ? "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            : "text-muted-foreground hover:text-success hover:bg-success/10"
        )}
        title={user.active ? "Desativar" : "Ativar"}
      >
        <Power className="h-4 w-4" />
      </button>
    </div>
  );
}
