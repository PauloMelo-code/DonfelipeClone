import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
      <h1 className="text-6xl font-bold tracking-tight text-cugini-orange">404</h1>
      <p className="mt-3 text-lg text-muted-foreground">Pagina nao encontrada</p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-cugini-orange px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-cugini-orange-light"
      >
        Voltar ao Dashboard
      </Link>
    </div>
  );
}
