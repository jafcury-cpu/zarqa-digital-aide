import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Chrome, Copy, LifeBuoy, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LoginErrorBoundary } from "@/components/auth/login-error-boundary";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { lovable } from "@/integrations/lovable";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { clearOAuthCallbackParams, mapOAuthError, readOAuthCallbackError, type OAuthErrorInfo } from "@/lib/oauth-errors";
import { logError } from "@/lib/error-telemetry";

const SUPPORT_HREF = "mailto:suporte@luize.app?subject=Falha%20no%20login%20Luize";
const STUCK_TIMEOUT_MS = 15_000;

const Login = () => {
  useDocumentTitle("Login");
  const { user } = useAuth();
  const location = useLocation();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [error, setError] = useState<OAuthErrorInfo | null>(null);
  const stuckTimerRef = useRef<number | null>(null);
  const redirectTo = typeof location.state?.from === "string" ? location.state.from : "/dashboard";

  // Detect OAuth callback errors on mount (e.g., redirected back with ?error=...)
  useEffect(() => {
    const cbError = readOAuthCallbackError();
    if (cbError) {
      setError(cbError);
      void logError({
        message: `[OAuth callback] ${cbError.title}: ${cbError.description}`,
        source: "oauth.callback",
        severity: "error",
        context: { code: cbError.code, raw: cbError.raw },
      });
      clearOAuthCallbackParams();
    }
  }, []);

  if (user) {
    return <Navigate to={redirectTo} replace />;
  }

  const clearStuckTimer = () => {
    if (stuckTimerRef.current !== null) {
      window.clearTimeout(stuckTimerRef.current);
      stuckTimerRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => () => clearStuckTimer(), []);

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    setStuck(false);
    setError(null);
    clearStuckTimer();
    stuckTimerRef.current = window.setTimeout(() => {
      setStuck(true);
      void logError({
        message: "[OAuth] Login travado: nenhum redirect/resposta após 15s",
        source: "oauth.stuck",
        severity: "warning",
        context: { origin: window.location.origin },
      });
    }, STUCK_TIMEOUT_MS);

    // Pre-flight validation: ensure origin is HTTPS or localhost (Google rejects http on real domains)
    const origin = window.location.origin;
    const isLocal = origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1");
    if (!origin.startsWith("https://") && !isLocal) {
      const info = mapOAuthError({
        message: `redirect_uri inválido: ${origin}. Google exige HTTPS para domínios públicos.`,
        code: "redirect_uri_mismatch",
      });
      setError(info);
      setSubmitting(false);
      return;
    }

    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: origin,
        extraParams: { prompt: "select_account" },
      });

      if (result.redirected) return;

      if (result.error) {
        const info = mapOAuthError(result.error);
        setError(info);
        void logError({
          message: `[OAuth] ${info.title}: ${info.description}`,
          source: "oauth.signin",
          severity: "error",
          context: { code: info.code, raw: info.raw, origin },
        });
        toast({
          variant: "destructive",
          title: info.title,
          description: info.description,
        });
        setSubmitting(false);
        return;
      }

      toast({ title: "Redirecionando", description: "Concluindo autenticação com Google." });
    } catch (err) {
      const info = mapOAuthError(err);
      setError(info);
      void logError({
        message: `[OAuth][throw] ${info.title}: ${info.description}`,
        source: "oauth.signin",
        severity: "error",
        stack: err instanceof Error ? err.stack : null,
        context: { code: info.code, raw: info.raw, origin },
      });
    } finally {
      clearStuckTimer();
      setSubmitting(false);
    }
  };

  const handleCancelStuck = () => {
    clearStuckTimer();
    setSubmitting(false);
    setStuck(false);
    sonnerToast.info("Tentativa cancelada. Você pode tentar de novo.");
  };

  const handleHardReset = () => {
    clearStuckTimer();
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
    window.location.href = "/login";
  };

  const copyTechnical = async () => {
    if (!error) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          { code: error.code, title: error.title, description: error.description, raw: error.raw, origin: window.location.origin },
          null,
          2,
        ),
      );
      sonnerToast.success("Detalhes técnicos copiados");
    } catch {
      sonnerToast.error("Não foi possível copiar");
    }
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.15fr_0.85fr]">
      <section className="relative hidden overflow-hidden border-r border-border lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div className="absolute inset-0 bg-hero opacity-80" />
        <div className="grid-tech absolute inset-0 opacity-20" />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <p className="text-kicker">Terminal executivo</p>
            <h1 className="mt-3 text-5xl font-semibold tracking-[0.16em] text-foreground">Luize</h1>
          </div>
          <ShieldCheck className="size-10 animate-pulse-soft text-primary" />
        </div>

        <div className="relative z-10 max-w-xl space-y-6">
          <p className="text-kicker">Painel privado</p>
          <p className="text-3xl font-semibold leading-tight text-foreground">
            Um painel privado para coordenar agenda, finanças, saúde e documentos com linguagem de comando executivo.
          </p>
          <div className="grid gap-3 text-sm text-muted-foreground">
            <div className="surface-panel flex items-center gap-3 p-4">
              <Chrome className="size-4 text-accent-blue" />
              Acesso restrito com conta Google autorizada.
            </div>
            <div className="surface-panel flex items-center gap-3 p-4">
              <Lock className="size-4 text-primary" />
              Banco, storage e autenticação protegidos no Lovable Cloud.
            </div>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10 md:px-8">
        <Card className="surface-elevated w-full max-w-md border-border/90 bg-panel-elevated">
          <CardHeader className="space-y-3">
            <p className="text-kicker">Acesso Privado</p>
            <CardTitle className="text-3xl tracking-tight">Entrar na Luize</CardTitle>
            <CardDescription>Login pessoal único com autenticação segura por Google.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {error && (
                <Alert variant="destructive" role="alert">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{error.title}</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p className="text-sm">{error.description}</p>
                    {error.guidance && (
                      <p className="rounded-md bg-destructive/10 p-2 text-xs leading-relaxed">
                        💡 {error.guidance}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button type="button" size="sm" variant="outline" onClick={copyTechnical}>
                        <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar detalhes
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setError(null)}>
                        Fechar
                      </Button>
                    </div>
                    <details className="pt-1">
                      <summary className="cursor-pointer text-[11px] opacity-70">Mensagem técnica · código {error.code}</summary>
                      <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-background/60 p-2 text-[11px]">
                        {error.raw ?? "(sem detalhes)"}
                      </pre>
                    </details>
                  </AlertDescription>
                </Alert>
              )}

              {stuck && submitting && (
                <Alert variant="destructive" role="alert">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>O login não respondeu</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p className="text-sm">
                      Não recebemos resposta do Google em 15 segundos. A janela pode ter sido bloqueada, ou a rede está instável.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button type="button" size="sm" variant="outline" onClick={handleCancelStuck}>
                        Cancelar tentativa
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={handleHardReset}>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Recarregar e limpar sessão
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <Button
                type="button"
                variant="hero"
                size="lg"
                className="w-full"
                disabled={submitting && !stuck}
                onClick={handleGoogleSignIn}
              >
                {error || stuck ? <RefreshCw className="size-4" /> : <Chrome className="size-4" />}
                {submitting && !stuck
                  ? "Conectando..."
                  : stuck
                    ? "Tentar de novo"
                    : error
                      ? "Tentar novamente"
                      : "Continuar com Google"}
              </Button>

              <div className="flex items-center justify-center gap-3 pt-1 text-xs">
                <a
                  href={SUPPORT_HREF}
                  className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  <LifeBuoy className="h-3.5 w-3.5" /> Falar com suporte
                </a>
                <span className="text-muted-foreground/50" aria-hidden>•</span>
                <a
                  href="/status"
                  className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Ver status do app
                </a>
              </div>

              <p className="text-center text-sm text-muted-foreground">Cadastro público desativado para operação pessoal segura.</p>
              <p className="text-center text-xs text-muted-foreground">
                O acesso por senha foi removido e o login agora acontece somente pelo Google autorizado.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

const LoginWithBoundary = () => (
  <LoginErrorBoundary supportHref={SUPPORT_HREF}>
    <Login />
  </LoginErrorBoundary>
);

export default LoginWithBoundary;
