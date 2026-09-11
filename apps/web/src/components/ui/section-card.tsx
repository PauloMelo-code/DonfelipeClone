"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  variant?: "default" | "strong" | "flat";
  padding?: "sm" | "md" | "lg";
}

/**
 * Card padronizado para qualquer secao de conteudo.
 * Usa .glass por padrao + header consistente (icon + uppercase title).
 *
 * Substitui dezenas de `<div className="glass rounded-2xl p-6">...` repetidos
 * pelas pages, garantindo padding, tipografia e espacamento uniformes.
 */
export function SectionCard({
  icon,
  title,
  description,
  action,
  children,
  className,
  variant = "default",
  padding = "md",
}: SectionCardProps) {
  const variantClass = {
    default: "glass",
    strong: "glass-strong",
    flat: "bg-card/40 border border-white/[0.04]",
  }[variant];

  const paddingClass = {
    sm: "p-4",
    md: "p-5",
    lg: "p-6",
  }[padding];

  return (
    <div className={cn(variantClass, "rounded-2xl", paddingClass, className)}>
      {(title || icon || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {icon && <span className="text-brand-gold shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
            <div className="min-w-0">
              {title && (
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60 truncate">
                  {title}
                </h3>
              )}
              {description && (
                <p className="mt-0.5 text-xs text-muted-foreground/50 truncate">
                  {description}
                </p>
              )}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
