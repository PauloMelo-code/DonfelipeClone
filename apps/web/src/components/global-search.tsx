"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, Car, Users, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface SearchResult {
  vehicles: Array<{ id: string; model: string; brand: string | null; year: number; km: number; price: number; status: string }>;
  groups: Array<{ id: string; name: string; groupId: string; role: string }>;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult>({ vehicles: [], groups: [] });
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults({ vehicles: [], groups: [] });
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (r.ok) setResults(await r.json());
      } catch { /* */ }
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const goTo = useCallback((url: string) => {
    setOpen(false);
    setQuery("");
    router.push(url);
  }, [router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} className="sm:max-w-xl p-0 overflow-hidden bg-[#0D0D0D] ring-1 ring-white/10">
        <DialogTitle className="sr-only">Busca</DialogTitle>
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            type="text"
            placeholder="Buscar veiculo, grupo, modelo..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <kbd className="hidden sm:inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">Esc</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {results.vehicles.length === 0 && results.groups.length === 0 && query.length >= 2 && !loading && (
            <p className="text-sm text-muted-foreground p-6 text-center">Nenhum resultado para &quot;{query}&quot;</p>
          )}
          {results.vehicles.length > 0 && (
            <div className="p-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60 px-3 py-1">Veiculos</p>
              {results.vehicles.map((v) => (
                <button
                  key={v.id}
                  onClick={() => goTo(`/veiculos?status=${v.status}`)}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/[0.04] text-left transition-colors"
                >
                  <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{v.brand ? `${v.brand} ` : ""}{v.model}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.year} • {v.km.toLocaleString("pt-BR")} km • R$ {v.price.toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    v.status === "PENDING" && "bg-warning/10 text-warning",
                    v.status === "APPROVED" && "bg-success/10 text-success",
                    v.status === "PUBLISHED" && "bg-cugini-orange/10 text-cugini-orange",
                    v.status === "REJECTED" && "bg-destructive/10 text-destructive",
                  )}>{v.status}</span>
                </button>
              ))}
            </div>
          )}
          {results.groups.length > 0 && (
            <div className="p-2 border-t border-white/[0.04]">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60 px-3 py-1">Grupos</p>
              {results.groups.map((g) => (
                <Link
                  key={g.id}
                  href="/grupos"
                  onClick={() => { setOpen(false); setQuery(""); }}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/[0.04] transition-colors"
                >
                  <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{g.name}</p>
                    <p className="text-xs text-muted-foreground">{g.role}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-white/[0.06] px-4 py-2 flex items-center gap-3 text-[10px] text-muted-foreground/60">
          <span>↑↓ navegar</span>
          <span>Enter abrir</span>
          <span className="ml-auto">⌘K abrir</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
