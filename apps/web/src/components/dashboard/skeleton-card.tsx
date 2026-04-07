"use client";

import { cn } from "@/lib/utils";

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-white/[0.05]",
        className
      )}
    />
  );
}

export function StatCardSkeleton() {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-start justify-between">
        <div className="space-y-3 flex-1">
          <Shimmer className="h-3 w-28" />
          <Shimmer className="h-9 w-20" />
        </div>
        <Shimmer className="h-11 w-11 rounded-xl" />
      </div>
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <Shimmer className="h-3 w-20" />
        <Shimmer className="h-8 w-36 rounded-lg" />
      </div>
      <div className="h-72 flex items-end gap-2 px-2">
        {Array.from({ length: 14 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 animate-pulse rounded-t-sm bg-white/[0.04]"
            style={{ height: `${30 + Math.sin(i * 0.8) * 20 + Math.random() * 30}%` }}
          />
        ))}
      </div>
    </div>
  );
}
