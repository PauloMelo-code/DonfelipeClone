"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { ErrorBoundary } from "@/components/error-boundary";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        onCollapsedChange={setCollapsed}
      />

      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-2.5 z-40 flex h-9 w-9 items-center justify-center rounded-xl gradient-orange text-white shadow-[0_2px_12px_rgba(232,115,26,0.3)] active:scale-95 transition-all md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <main
        className={cn(
          "flex-1 transition-all duration-300",
          collapsed ? "md:ml-[72px]" : "md:ml-[260px]"
        )}
      >
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}
