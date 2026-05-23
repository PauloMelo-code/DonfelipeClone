import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

/**
 * Wrapper padronizado de pagina interna.
 * Garante:
 * - Padding consistente (p-4 mobile, p-6 desktop)
 * - space-y vertical uniforme
 * - pb-20 mobile para nao colidir com bottom nav fixa
 */
export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn("p-4 md:p-6 pb-24 md:pb-10 space-y-4 md:space-y-6", className)}>
      {children}
    </div>
  );
}
