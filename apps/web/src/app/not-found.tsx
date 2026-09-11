import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
      <h1 className="text-6xl font-bold tracking-tight text-brand-gold">404</h1>
      <p className="mt-3 text-lg text-muted-foreground">Pagina nao encontrada</p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-brand-gold px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-gold-light"
      >
        Voltar ao Dashboard
      </Link>
    </div>
  );
}
