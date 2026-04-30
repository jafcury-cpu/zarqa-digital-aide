import { Component, type ReactNode } from "react";
import { AlertTriangle, LifeBuoy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { logError } from "@/lib/error-telemetry";

type Props = {
  children: ReactNode;
  /** Optional callback when user clicks "Tentar novamente" */
  onReset?: () => void;
  /** Where the support link should go (mailto, tel, https://...) */
  supportHref?: string;
  /** Label shown for the support link */
  supportLabel?: string;
};

type State = {
  error: Error | null;
};

export class LoginErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    void logError({
      message: `[Login crash] ${error.message}`,
      stack: error.stack ?? null,
      source: "login.boundary",
      severity: "error",
      context: { componentStack: info.componentStack },
    });
  }

  private handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  private handleHardReload = () => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.clear();
      } catch {
        /* ignore */
      }
      window.location.href = "/login";
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    const supportHref = this.props.supportHref ?? "mailto:suporte@luize.app?subject=Falha%20no%20login%20Luize";
    const supportLabel = this.props.supportLabel ?? "Falar com suporte";

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md border-destructive/40 bg-panel-elevated">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <CardTitle className="text-xl">Tela de login indisponível</CardTitle>
            </div>
            <CardDescription>
              Algo travou ao carregar o login. Você pode tentar de novo, recarregar limpando a sessão local, ou contatar o suporte.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertTitle>Detalhe técnico</AlertTitle>
              <AlertDescription className="break-all text-xs">
                {this.state.error.message || "Erro desconhecido"}
              </AlertDescription>
            </Alert>
            <div className="flex flex-col gap-2">
              <Button onClick={this.handleReset} variant="hero" size="lg" className="w-full">
                <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
              </Button>
              <Button onClick={this.handleHardReload} variant="outline" size="lg" className="w-full">
                Recarregar e limpar sessão
              </Button>
              <Button asChild variant="ghost" size="sm" className="w-full">
                <a href={supportHref} target="_blank" rel="noreferrer">
                  <LifeBuoy className="mr-2 h-4 w-4" /> {supportLabel}
                </a>
              </Button>
              <Button asChild variant="ghost" size="sm" className="w-full">
                <a href="/status">Abrir página de Status →</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}
