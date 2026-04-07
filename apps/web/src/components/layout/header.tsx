"use client";

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

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const { data: session } = useSession();

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
        <h1 className="text-base md:text-xl font-semibold tracking-[-0.02em] text-foreground">{title}</h1>
        {subtitle && (
          <p className="hidden sm:block text-[13px] text-muted-foreground/70">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-4">
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
