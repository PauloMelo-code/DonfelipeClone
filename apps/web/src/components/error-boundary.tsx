"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <div className="rounded-full bg-destructive/10 p-4 mb-4">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Algo deu errado
          </h2>
          <p className="text-sm text-muted-foreground mb-4 max-w-md">
            Ocorreu um erro inesperado. Tente recarregar a pagina.
          </p>
          {this.state.error && (
            <pre className="text-xs text-muted-foreground bg-card rounded-lg p-3 mb-4 max-w-md overflow-auto">
              {this.state.error.message}
            </pre>
          )}
          <Button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="gap-2 gradient-orange text-white border-0"
          >
            <RefreshCw className="h-4 w-4" />
            Recarregar
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
