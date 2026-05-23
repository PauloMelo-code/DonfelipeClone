"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { ErrorBoundary } from "@/components/error-boundary";
import { ServiceWorkerRegister } from "./_components/sw-register";
import { PushPrompt } from "@/components/notifications/push-prompt";
import { GlobalSearch } from "@/components/global-search";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar onCollapsedChange={setCollapsed} />

      <main
        className={cn(
          "flex-1 transition-all duration-300 pb-16 md:pb-0",
          collapsed ? "md:ml-[72px]" : "md:ml-[260px]"
        )}
      >
        {/* key={pathname} forca o ErrorBoundary a REMONTAR ao trocar de rota.
            Sem isso, um erro na rota A persistia o fallback ao navegar pra rota B,
            travando o app inteiro ate o usuario clicar em 'Recarregar'. */}
        <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
      </main>

      <MobileBottomNav />
      <ServiceWorkerRegister />
      <PushPrompt />
      <GlobalSearch />
    </div>
  );
}
