"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Car,
  Send,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Shield,
  UserCog,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const navigation = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Veiculos", href: "/veiculos", icon: Car },
  { label: "Publicacoes", href: "/publicacoes", icon: Send },
  { label: "Insights", href: "/insights", icon: BarChart3 },
  { label: "Grupos", href: "/grupos", icon: Users },
  { label: "Usuarios", href: "/usuarios", icon: UserCog },
  { label: "Auditoria", href: "/auditoria", icon: Shield },
];

const bottomNavigation = [
  { label: "Configuracoes", href: "/configuracoes", icon: Settings },
];

interface SidebarProps {
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function Sidebar({ onCollapsedChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    onCollapsedChange?.(collapsed);
  }, [collapsed, onCollapsedChange]);


  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const NavItem = ({
    item,
  }: {
    item: { label: string; href: string; icon: React.ElementType };
  }) => {
    const active = isActive(item.href);
    const Icon = item.icon;

    const content = (
      <Link
        href={item.href}
        className={cn(
          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200",
          active
            ? "bg-cugini-orange/[0.08] text-cugini-orange"
            : "text-muted-foreground/70 hover:bg-white/[0.04] hover:text-foreground"
        )}
      >
        {active && (
          <motion.div
            layoutId="sidebar-active"
            className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-cugini-orange"
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
          />
        )}
        <Icon className={cn("h-[18px] w-[18px] shrink-0", active && "text-cugini-orange")} />
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden whitespace-nowrap"
            >
              {item.label}
            </motion.span>
          )}
        </AnimatePresence>
      </Link>
    );

    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger className="w-full" render={<div />}>
            {content}
          </TooltipTrigger>
          <TooltipContent side="right" className="glass-strong">
            {item.label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return content;
  };

  return (
    <>
      <motion.aside
        animate={{ width: collapsed ? 72 : 260 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="fixed left-0 top-0 z-50 hidden md:flex h-screen flex-col border-r border-white/[0.04] bg-sidebar"
      >
        {/* Logo */}
        <div className="flex h-14 items-center justify-center border-b border-white/[0.04] px-4">
          <Link href="/" className="flex items-center justify-center">
            <div className={cn(
              "relative shrink-0 overflow-hidden transition-all duration-300",
              collapsed ? "h-9 w-9" : "h-12 w-48"
            )}>
              <Image
                src="/logo-cugini.png"
                alt="Cugini Repasses"
                fill
                className="object-contain"
              />
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 px-3 py-5">
          {navigation.map((item) => (
            <NavItem key={item.href} item={item} />
          ))}
        </nav>

        {/* Bottom */}
        <div className="border-t border-white/[0.04] px-3 py-4 space-y-0.5">
          {bottomNavigation.map((item) => (
            <NavItem key={item.href} item={item} />
          ))}

          {/* Collapse button - desktop only */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden w-full items-center justify-center rounded-xl p-2.5 text-muted-foreground/50 transition-colors hover:bg-white/[0.04] hover:text-foreground md:flex"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>
      </motion.aside>
    </>
  );
}
