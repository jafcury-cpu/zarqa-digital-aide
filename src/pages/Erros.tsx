import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/use-document-title";
import {
  getLocalRecentErrors,
  clearLocalRecentErrors,
  logError,
} from "@/lib/error-telemetry";
import { AlertTriangle, RefreshCw, Trash2, Bug, Copy } from "lucide-react";

interface DbErrorLog {
  id: string;
  message: string;
  stack: string | null;
  source: string;
  severity: string;
  route: string | null;
  user_agent: string | null;
  request_id: string | null;
  context: Record<string, unknown> | null;
  created_at: string;
}

const severityVariant: Record<string, "destructive" | "warning" | "info"> = {
  error: "destructive",
  warning: "warning",
  info: "info",
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function ErrorCard({
  message,
  stack,
  source,
  severity,
  route,
  request_id,
  created_at,
  context,
}: {
  message: string;
  stack?: string | null;
  source: string;
  severity: string;
  route?: string | null;
  request_id?: string | null;
  created_at: string;
  context?: Record<string, unknown> | null;
}) {
  const { toast } = useToast();
  const variant = severityVariant[severity] ?? "info";

  const copy = async () => {
    const payload = JSON.stringify(
      { message, stack, source, severity, route, request_id, created_at, context },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(payload);
      toast({ title: "Copiado", description: "Detalhes do erro na área de transferência." });
    } catch {
      toast({ variant: "destructive", title: "Falha ao copiar" });
    }
  };

  return (
    <Card className="space-y-3 border-border/60 bg-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={variant}>{severity}</Badge>
            <Badge variant="outline" className="font-mono text-[10px]">{source}</Badge>
            {route ? (
              <Badge variant="outline" className="font-mono text-[10px]">{route}</Badge>
            ) : null}
          </div>
          <p className="mt-2 break-words font-mono text-sm text-foreground">{message}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={copy} title="Copiar JSON">
          <Copy className="size-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{fmtDate(created_at)}</span>
        {request_id ? (
          <span className="font-mono">req: {request_id.slice(0, 12)}…</span>
        ) : null}
      </div>

      {stack ? (
        <details className="group">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Stack trace
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-border/60 bg-background/60 p-3 text-[11px] leading-relaxed text-muted-foreground">
            {stack}
          </pre>
        </details>
      ) : null}

      {context && Object.keys(context).length > 0 ? (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Contexto
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-border/60 bg-background/60 p-3 text-[11px] text-muted-foreground">
            {JSON.stringify(context, null, 2)}
          </pre>
        </details>
      ) : null}
    </Card>
  );
}

export default function Erros() {
  useDocumentTitle("Erros · Luize");
  const { toast } = useToast();
  const [dbLogs, setDbLogs] = useState<DbErrorLog[]>([]);
  const [localLogs, setLocalLogs] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);

  const loadDb = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("error_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setDbLogs((data ?? []) as DbErrorLog[]);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Falha ao carregar erros",
        description: e instanceof Error ? e.message : "Tente novamente.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadLocal = useCallback(() => {
    setLocalLogs(getLocalRecentErrors());
  }, []);

  useEffect(() => {
    loadDb();
    loadLocal();
    const onLogged = () => loadLocal();
    window.addEventListener("luize:error-logged", onLogged);
    return () => window.removeEventListener("luize:error-logged", onLogged);
  }, [loadDb, loadLocal]);

  const clearDb = async () => {
    if (!confirm("Apagar todos os erros salvos?")) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user?.id) return;
    const { error } = await supabase
      .from("error_logs")
      .delete()
      .eq("user_id", auth.user.id);
    if (error) {
      toast({ variant: "destructive", title: "Falha ao limpar", description: error.message });
      return;
    }
    setDbLogs([]);
    toast({ title: "Histórico de erros limpo" });
  };

  const triggerTest = () => {
    void logError({
      message: "Erro de teste disparado manualmente",
      stack: new Error("test").stack ?? null,
      source: "manual-test",
      severity: "warning",
      context: { triggeredAt: new Date().toISOString() },
    });
    toast({ title: "Erro de teste registrado" });
    setTimeout(() => loadDb(), 500);
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-kicker">Telemetria</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl tracking-tight">Erros do app</h2>
            <p className="text-sm text-muted-foreground">
              Falhas capturadas automaticamente com stack trace, request ID e horário.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={loadDb} disabled={loading}>
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={triggerTest}>
              <Bug className="size-4" />
              Disparar teste
            </Button>
            <Button variant="destructive" size="sm" onClick={clearDb} disabled={dbLogs.length === 0}>
              <Trash2 className="size-4" />
              Limpar
            </Button>
          </div>
        </div>
      </header>

      <Tabs defaultValue="cloud" className="space-y-4">
        <TabsList>
          <TabsTrigger value="cloud">
            Persistido <Badge variant="outline" className="ml-2">{dbLogs.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="local">
            Sessão atual <Badge variant="outline" className="ml-2">{localLogs.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cloud" className="space-y-3">
          {dbLogs.length === 0 ? (
            <Card className="flex flex-col items-center gap-2 border-dashed border-border/60 bg-panel/50 p-8 text-center">
              <AlertTriangle className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nenhum erro registrado. Bom sinal! 🎉
              </p>
            </Card>
          ) : (
            dbLogs.map((log) => (
              <ErrorCard
                key={log.id}
                message={log.message}
                stack={log.stack}
                source={log.source}
                severity={log.severity}
                route={log.route}
                request_id={log.request_id}
                created_at={log.created_at}
                context={log.context}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="local" className="space-y-3">
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => { clearLocalRecentErrors(); loadLocal(); }}>
              Limpar sessão
            </Button>
          </div>
          {localLogs.length === 0 ? (
            <Card className="flex flex-col items-center gap-2 border-dashed border-border/60 bg-panel/50 p-8 text-center">
              <p className="text-sm text-muted-foreground">Nenhum erro nesta sessão.</p>
            </Card>
          ) : (
            localLogs.map((log, idx) => (
              <ErrorCard
                key={idx}
                message={String(log.message ?? "")}
                stack={(log.stack as string | null) ?? null}
                source={String(log.source ?? "app")}
                severity={String(log.severity ?? "error")}
                route={(log.route as string | null) ?? null}
                request_id={(log.request_id as string | null) ?? null}
                created_at={String(log.created_at ?? new Date().toISOString())}
                context={(log.context as Record<string, unknown> | null) ?? null}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
