import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { logError } from "@/lib/error-telemetry";

type CheckState = "idle" | "running" | "pass" | "fail";

interface CheckResult {
  state: CheckState;
  detail?: string;
  durationMs?: number;
}

interface Checks {
  session: CheckResult;
  rls: CheckResult;
  layout: CheckResult;
}

const initial: Checks = {
  session: { state: "idle" },
  rls: { state: "idle" },
  layout: { state: "idle" },
};

const PostLogin = () => {
  useDocumentTitle("Verificando acesso");
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [checks, setChecks] = useState<Checks>(initial);
  const [running, setRunning] = useState(false);
  const [allPassed, setAllPassed] = useState(false);
  const ranOnce = useRef(false);

  const update = (k: keyof Checks, patch: Partial<CheckResult>) =>
    setChecks((prev) => ({ ...prev, [k]: { ...prev[k], ...patch } }));

  const runChecks = async () => {
    setRunning(true);
    setAllPassed(false);
    setChecks(initial);

    // 1) Sessão Supabase válida
    update("session", { state: "running" });
    const t0 = performance.now();
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const session = sessionData?.session ?? null;
    const sessionDur = Math.round(performance.now() - t0);

    if (sessionError || !session) {
      update("session", {
        state: "fail",
        detail: sessionError?.message ?? "Sem sessão ativa.",
        durationMs: sessionDur,
      });
      void logError({
        message: "[post-login] sessão ausente/invalida",
        source: "post-login.session",
        severity: "error",
        context: { error: sessionError?.message },
      });
      setRunning(false);
      return;
    }

    const expISO = session.expires_at ? new Date(session.expires_at * 1000).toISOString() : "—";
    update("session", {
      state: "pass",
      detail: `user ${session.user.id.slice(0, 8)}… · expira ${expISO}`,
      durationMs: sessionDur,
    });

    // 2) RLS — query autenticada em tabela protegida
    update("rls", { state: "running" });
    const t1 = performance.now();
    const { error: rlsError } = await supabase
      .from("settings")
      .select("id", { head: true, count: "exact" });
    const rlsDur = Math.round(performance.now() - t1);

    if (rlsError) {
      const isRls = /row-level security|violates row-level/i.test(rlsError.message);
      update("rls", {
        state: "fail",
        detail: `${isRls ? "[RLS] " : ""}${rlsError.message}`,
        durationMs: rlsDur,
      });
      void logError({
        message: `[post-login] RLS falhou: ${rlsError.message}`,
        source: "post-login.rls",
        severity: "error",
      });
      setRunning(false);
      return;
    }
    update("rls", { state: "pass", detail: "Query autenticada respondeu", durationMs: rlsDur });

    // 3) Layout protegido — pré-carrega o chunk do Dashboard
    update("layout", { state: "running" });
    const t2 = performance.now();
    try {
      await import("./Dashboard.tsx");
      const dur = Math.round(performance.now() - t2);
      update("layout", { state: "pass", detail: "Chunk do Dashboard carregado", durationMs: dur });
      setAllPassed(true);
    } catch (err) {
      const dur = Math.round(performance.now() - t2);
      const msg = err instanceof Error ? err.message : String(err);
      update("layout", { state: "fail", detail: msg, durationMs: dur });
      void logError({
        message: `[post-login] falha ao carregar Dashboard: ${msg}`,
        source: "post-login.layout",
        severity: "error",
      });
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (loading || ranOnce.current || !user) return;
    ranOnce.current = true;
    void runChecks();
  }, [loading, user]);

  if (!loading && !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10 md:px-6">
      <div className="mx-auto max-w-2xl">
        <Card className="surface-elevated border-border/90 bg-panel-elevated">
          <CardHeader className="space-y-2">
            <p className="text-kicker">Diagnóstico de acesso</p>
            <CardTitle className="flex items-center gap-2 text-2xl tracking-tight">
              <ShieldCheck className="size-6 text-primary" /> Verificando sessão e rota protegida
            </CardTitle>
            <CardDescription>
              Antes de abrir o dashboard, validamos sessão Supabase, acesso RLS e o carregamento do layout protegido.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CheckRow label="Sessão Supabase" result={checks.session} />
            <CheckRow label="Banco / RLS (settings)" result={checks.rls} />
            <CheckRow label="Rota protegida (Dashboard chunk)" result={checks.layout} />

            {allPassed && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Tudo certo</AlertTitle>
                <AlertDescription>Sessão válida e rota protegida respondendo. Você pode prosseguir.</AlertDescription>
              </Alert>
            )}

            {!running && !allPassed && (checks.session.state === "fail" || checks.rls.state === "fail" || checks.layout.state === "fail") && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Uma verificação falhou</AlertTitle>
                <AlertDescription>
                  Tente novamente. Se o erro persistir, abra a página de status para diagnóstico completo.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={runChecks} disabled={running}>
                  {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                  Rodar verificação novamente
                </Button>
                <Button asChild type="button" variant="ghost" size="sm">
                  <Link to="/status">Ver status detalhado</Link>
                </Button>
              </div>
              <Button
                type="button"
                variant="hero"
                size="lg"
                disabled={!allPassed || running}
                onClick={() => navigate("/dashboard", { replace: true })}
              >
                Ir para o Dashboard <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const CheckRow = ({ label, result }: { label: string; result: CheckResult }) => {
  const Icon =
    result.state === "pass"
      ? CheckCircle2
      : result.state === "fail"
        ? XCircle
        : result.state === "running"
          ? Loader2
          : ShieldCheck;
  const color =
    result.state === "pass"
      ? "text-emerald-400"
      : result.state === "fail"
        ? "text-destructive"
        : result.state === "running"
          ? "text-accent-blue"
          : "text-muted-foreground";

  return (
    <div className="surface-panel flex items-start justify-between gap-3 p-3">
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-4 w-4 ${color} ${result.state === "running" ? "animate-spin" : ""}`} />
        <div>
          <p className="text-sm font-medium">{label}</p>
          {result.detail && (
            <p className="mt-0.5 text-xs text-muted-foreground break-all">{result.detail}</p>
          )}
        </div>
      </div>
      {typeof result.durationMs === "number" && (
        <span className="text-[11px] text-muted-foreground tabular-nums">{result.durationMs}ms</span>
      )}
    </div>
  );
};

export default PostLogin;
