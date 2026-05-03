"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Car,
  Send,
  Users,
  MoreHorizontal,
  UserCog,
  Shield,
  Settings,
  BarChart3,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const PRIMARY_NAV = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Veiculos", href: "/veiculos", icon: Car },
  { label: "Publicacoes", href: "/publicacoes", icon: Send },
  { label: "Grupos", href: "/grupos", icon: Users },
];

const MORE_NAV = [
  { label: "Insights", href: "/insights", icon: BarChart3 },
  { label: "Usuarios", href: "/usuarios", icon: UserCog },
  { label: "Auditoria", href: "/auditoria", icon: Shield },
  { label: "Configuracoes", href: "/configuracoes", icon: Settings },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const isMoreActive = MORE_NAV.some((item) => isActive(item.href));

  return (
    <>
      {/* More sheet backdrop */}
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMoreOpen(false)}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          />
        )}
      </AnimatePresence>

      {/* More sheet */}
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 400, damping: 40 }}
            className="fixed bottom-16 left-0 right-0 z-50 md:hidden rounded-t-2xl border-t border-white/[0.06] bg-[#0D0D0F] px-4 pb-4 pt-3"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/40">
                Mais opções
              </span>
              <button
                onClick={() => setMoreOpen(false)}
                className="rounded-lg p-1 text-muted-foreground/50 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1">
              {MORE_NAV.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                      active
                        ? "bg-cugini-orange/[0.08] text-cugini-orange"
                        : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-white/[0.06] bg-[#0D0D0F]/95 backdrop-blur-xl">
        <div className="flex items-stretch">
          {PRIMARY_NAV.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
                  active ? "text-cugini-orange" : "text-muted-foreground/60"
                )}
              >
                <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_6px_rgba(232,115,26,0.6)]")} />
                {item.label}
              </Link>
            );
          })}

          {/* Mais button */}
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
              (isMoreActive || moreOpen) ? "text-cugini-orange" : "text-muted-foreground/60"
            )}
          >
            <MoreHorizontal className={cn("h-5 w-5", (isMoreActive || moreOpen) && "drop-shadow-[0_0_6px_rgba(232,115,26,0.6)]")} />
            Mais
          </button>
        </div>
      </nav>
    </>
  );
}
