"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
      <h1 className="text-4xl font-bold tracking-tight text-destructive">Erro</h1>
      <p className="mt-3 text-muted-foreground">Algo deu errado. Tente novamente.</p>
      <button
        onClick={reset}
        className="mt-6 rounded-lg bg-brand-gold px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-brand-gold-light"
      >
        Tentar novamente
      </button>
    </div>
  );
}
