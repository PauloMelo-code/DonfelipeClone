"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusKind =
  | "pending"
  | "approved"
  | "rejected"
  | "published"
  | "success"
  | "failed"
  | "active"
  | "inactive"
  | "info"
  | "warning"
  | "vip"
  | "neutral";

interface StatusBadgeProps {
  kind: StatusKind;
  label?: string;
  icon?: ReactNode;
  size?: "xs" | "sm" | "md";
  className?: string;
}

const kindStyles: Record<StatusKind, { bg: string; text: string; border: string }> = {
  pending: { bg: "bg-warning/10", text: "text-warning", border: "border-warning/20" },
  approved: { bg: "bg-success/10", text: "text-success", border: "border-success/20" },
  rejected: { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/20" },
  published: { bg: "bg-cugini-orange/10", text: "text-cugini-orange", border: "border-cugini-orange/20" },
  success: { bg: "bg-success/10", text: "text-success", border: "border-success/20" },
  failed: { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/20" },
  active: { bg: "bg-success/[0.07]", text: "text-success", border: "border-success/20" },
  inactive: { bg: "bg-muted/40", text: "text-muted-foreground", border: "border-white/[0.04]" },
  info: { bg: "bg-blue-400/10", text: "text-blue-300", border: "border-blue-400/20" },
  warning: { bg: "bg-warning/10", text: "text-warning", border: "border-warning/20" },
  vip: { bg: "bg-yellow-400/10", text: "text-yellow-400", border: "border-yellow-400/25" },
  neutral: { bg: "bg-white/[0.04]", text: "text-muted-foreground", border: "border-white/[0.06]" },
};

const sizeStyles = {
  xs: "text-[10px] px-1.5 py-0.5 gap-1",
  sm: "text-[11px] px-2 py-0.5 gap-1",
  md: "text-xs px-2.5 py-1 gap-1.5",
};

const defaultLabels: Partial<Record<StatusKind, string>> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Rejeitado",
  published: "Publicado",
  success: "Enviado",
  failed: "Falha",
  active: "Ativo",
  inactive: "Inativo",
  vip: "VIP",
};

/**
 * Badge de status com mapa central de cores.
 * Substitui statusConfig duplicado em varias paginas.
 */
export function StatusBadge({ kind, label, icon, size = "sm", className }: StatusBadgeProps) {
  const styles = kindStyles[kind];
  const text = label ?? defaultLabels[kind] ?? kind;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium whitespace-nowrap",
        styles.bg,
        styles.text,
        styles.border,
        sizeStyles[size],
        className
      )}
    >
      {icon && <span className="[&>svg]:h-3 [&>svg]:w-3">{icon}</span>}
      {text}
    </span>
  );
}
