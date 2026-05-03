"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface HeaderProps {
  title: string;
  subtitle?: string;
  live?: boolean;
}

export function Header({ title, subtitle, live }: HeaderProps) {
  const { data: session } = useSession();
  const [paused, setPaused] = useState(false);
  const [health, setHealth] = useState<"ok" | "error" | "checking">("checking");

  useEffect(() => {
    fetch("/api/publishing/pause")
      .then((r) => r.json())
      .then((d) => setPaused(!!d.paused))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const r = await fetch("/api/health");
        if (!cancelled) setHealth(r.ok ? "ok" : "error");
      } catch {
        if (!cancelled) setHealth("error");
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const togglePause = async () => {
    const next = !paused;
    try {
      const res = await fetch("/api/publishing/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: next }),
      });
      if (res.ok) {
        setPaused(next);
        toast.success(next ? "Disparo pausado" : "Disparo retomado");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error || "Erro ao alternar pausa");
      }
    } catch {
      toast.error("Erro de conexao");
    }
  };

  const initials = session?.user?.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "CG";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/[0.04] bg-background/60 backdrop-blur-2xl pl-14 pr-4 md:px-6">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-base md:text-xl font-semibold tracking-[-0.02em] text-foreground">{title}</h1>
          {live && (
            <span className="hidden sm:flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              </span>
              Ao vivo
            </span>
          )}
        </div>
        {subtitle && (
          <p className="hidden sm:block text-[13px] text-muted-foreground/70">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
            health === "ok" && "bg-success/15 text-success border border-success/30",
            health === "error" && "bg-destructive/15 text-destructive border border-destructive/30 animate-pulse",
            health === "checking" && "bg-card border border-border text-muted-foreground"
          )}
          title={health === "ok" ? "Sistema operacional" : health === "error" ? "Sistema com problemas" : "Verificando..."}
        >
          <span className={cn(
            "h-1.5 w-1.5 rounded-full",
            health === "ok" && "bg-success",
            health === "error" && "bg-destructive",
            health === "checking" && "bg-muted-foreground"
          )} />
          {health === "ok" ? "Online" : health === "error" ? "Offline" : "..."}
        </span>

        <button
          onClick={togglePause}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            paused
              ? "bg-destructive/15 text-destructive border border-destructive/40 animate-pulse"
              : "bg-card border border-border text-muted-foreground hover:text-foreground"
          )}
          title={paused ? "Retomar disparos" : "Pausar todos os disparos"}
        >
          {paused ? "🛑 Pausado" : "▶️ Ativo"}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-full transition-all duration-200 hover:opacity-80 outline-none">
            <Avatar className="h-8 w-8 border border-white/[0.08] transition-colors duration-200 hover:border-cugini-orange/30">
              <AvatarFallback className="bg-cugini-orange/[0.08] text-[11px] font-semibold text-cugini-orange">
                {initials}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 glass-strong">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{session?.user?.name}</p>
              <p className="text-xs text-muted-foreground">
                {session?.user?.email}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2">
              <User className="h-4 w-4" />
              Meu Perfil
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-destructive focus:text-destructive"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
