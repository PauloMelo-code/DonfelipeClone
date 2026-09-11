"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: number;
  suffix?: string;
  icon: React.ReactNode;
  trend?: { value: number; positive: boolean };
  className?: string;
}

function useCountUp(end: number, duration = 1000) {
  const [count, setCount] = useState(0);
  const prevEnd = useRef(0);

  useEffect(() => {
    const start = prevEnd.current;
    prevEnd.current = end;
    const startTime = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(start + (end - start) * eased));

      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [end, duration]);

  return count;
}

export function StatCard({
  title,
  value,
  suffix,
  icon,
  trend,
  className,
}: StatCardProps) {
  const animatedValue = useCountUp(value);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "group glass rounded-2xl p-6 transition-all duration-300",
        "hover:glow-gold-sm hover:border-white/[0.08] hover:-translate-y-0.5",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground/60">
            {title}
          </p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold tracking-[-0.02em] text-foreground tabular-nums">
              {animatedValue.toLocaleString("pt-BR")}
            </span>
            {suffix && (
              <span className="text-sm font-medium text-muted-foreground/60">
                {suffix}
              </span>
            )}
          </div>
          {trend && (
            <div
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                trend.positive
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive"
              )}
            >
              {trend.positive ? "+" : ""}
              {trend.value}%
            </div>
          )}
        </div>
        <div className="rounded-xl bg-gradient-to-br from-brand-gold/15 to-brand-gold/5 p-3 text-brand-gold transition-transform duration-300 group-hover:scale-105">
          {icon}
        </div>
      </div>
    </motion.div>
  );
}
