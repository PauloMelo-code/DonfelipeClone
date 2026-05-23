"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type AlertVariant = "info" | "success" | "warning" | "destructive" | "vip";

interface AlertBannerProps {
  variant?: AlertVariant;
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  className?: string;
}

const variantStyles: Record<AlertVariant, { border: string; bg: string; text: string; subText: string; action: string }> = {
  info: {
    border: "border-blue-400/30",
    bg: "bg-blue-400/[0.05]",
    text: "text-blue-300",
    subText: "text-blue-300/70",
    action: "bg-blue-400/15 border-blue-400/30 text-blue-300 hover:bg-blue-400/20",
  },
  success: {
    border: "border-success/30",
    bg: "bg-success/[0.05]",
    text: "text-success",
    subText: "text-success/70",
    action: "bg-success/15 border-success/30 text-success hover:bg-success/20",
  },
  warning: {
    border: "border-warning/40",
    bg: "bg-warning/[0.05]",
    text: "text-warning",
    subText: "text-warning/70",
    action: "bg-warning/15 border-warning/30 text-warning hover:bg-warning/20",
  },
  destructive: {
    border: "border-destructive/40",
    bg: "bg-destructive/[0.05]",
    text: "text-destructive",
    subText: "text-destructive/70",
    action: "bg-destructive/15 border-destructive/30 text-destructive hover:bg-destructive/20",
  },
  vip: {
    border: "border-yellow-400/40",
    bg: "bg-yellow-400/[0.05]",
    text: "text-yellow-400",
    subText: "text-yellow-400/70",
    action: "bg-yellow-400/15 border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/20",
  },
};

/**
 * Banner de alerta com 5 variantes (info, success, warning, destructive, vip).
 * Substitui blocos hardcoded de `rounded-2xl border-X/40 bg-X/5 p-4 flex` espalhados.
 */
export function AlertBanner({
  variant = "info",
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  onDismiss,
  className,
}: AlertBannerProps) {
  const styles = variantStyles[variant];

  const ActionBtn = actionHref ? (
    <Link
      href={actionHref}
      className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors", styles.action)}
    >
      {actionLabel} →
    </Link>
  ) : onAction ? (
    <button
      onClick={onAction}
      className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors", styles.action)}
    >
      {actionLabel} →
    </button>
  ) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "rounded-2xl border p-4 flex items-center gap-3",
        styles.border,
        styles.bg,
        className
      )}
    >
      {icon && (
        <span className={cn("shrink-0 [&>svg]:h-6 [&>svg]:w-6", styles.text)}>{icon}</span>
      )}
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-semibold", styles.text)}>{title}</p>
        {description && <p className={cn("text-xs mt-0.5", styles.subText)}>{description}</p>}
      </div>
      {ActionBtn}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className={cn("shrink-0 rounded-lg p-1 transition-colors hover:bg-white/[0.05]", styles.text)}
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </motion.div>
  );
}
