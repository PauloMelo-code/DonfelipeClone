"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { ErrorBoundary } from "@/components/error-boundary";
import { ServiceWorkerRegister } from "./_components/sw-register";
import { PushPrompt } from "@/components/notifications/push-prompt";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar onCollapsedChange={setCollapsed} />

      <main
        className={cn(
          "flex-1 transition-all duration-300 pb-16 md:pb-0",
          collapsed ? "md:ml-[72px]" : "md:ml-[260px]"
        )}
      >
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>

      <MobileBottomNav />
      <ServiceWorkerRegister />
      <PushPrompt />
    </div>
  );
}
