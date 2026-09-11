"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

/**
 * Estado vazio padronizado. Substitui blocos do tipo:
 *   <Send className="mb-3 h-12 w-12 opacity-20" />
 *   <p>Nenhum X encontrado</p>
 * que se repetem em N telas.
 */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className,
}: EmptyStateProps) {
  const ActionBtn = (actionLabel && (actionHref || onAction))
    ? actionHref
      ? <Link href={actionHref} className="mt-4 inline-flex items-center gap-1.5 rounded-lg gradient-gold px-4 py-2 text-sm font-medium text-black transition-all hover:shadow-[0_4px_20px_rgba(201, 151, 61,0.3)]">{actionLabel}</Link>
      : <button onClick={onAction} className="mt-4 inline-flex items-center gap-1.5 rounded-lg gradient-gold px-4 py-2 text-sm font-medium text-black transition-all hover:shadow-[0_4px_20px_rgba(201, 151, 61,0.3)]">{actionLabel}</button>
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}
    >
      {icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.02] border border-white/[0.04] text-muted-foreground/40 [&>svg]:h-7 [&>svg]:w-7">
          {icon}
        </div>
      )}
      <p className="text-base font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground/60">{description}</p>
      )}
      {ActionBtn}
    </motion.div>
  );
}
