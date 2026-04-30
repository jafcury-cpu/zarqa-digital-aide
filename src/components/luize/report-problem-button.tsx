import { useState } from "react";
import { Bug, Copy, Download, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/integrations/supabase/client";
import { getActionTrail } from "@/lib/action-trail";
import { getDebugEntries } from "@/lib/debug-mode";
import { getLocalRecentErrors, logError } from "@/lib/error-telemetry";

const SP_TZ = "America/Sao_Paulo";

function nowSP() {
  return new Date().toLocaleString("pt-BR", { timeZone: SP_TZ });
}

function buildReport(description: string, route: string, userEmail?: string | null) {
  const actions = getActionTrail();
  const debugEntries = getDebugEntries().slice(0, 20);
  const recentErrors = getLocalRecentErrors().slice(0, 10);

  return {
    generatedAt: new Date().toISOString(),
    generatedAtSP: nowSP(),
    user: userEmail ?? null,
    route,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    description: description.trim() || "(sem descrição)",
    lastActions: actions.map((a) => ({
      at: new Date(a.at).toISOString(),
      kind: a.kind,
      label: a.label,
      route: a.route,
    })),
    debugEntries: debugEntries.map((d) => ({
      at: new Date(d.at).toISOString(),
      level: d.level,
      source: d.source,
      message: d.message,
      details: d.details,
    })),
    recentErrors,
  };
}

export function ReportProblemButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);

  const route = typeof window !== "undefined" ? window.location.pathname + window.location.search : "";
  const report = buildReport(description, route, user?.email);
  const reportJson = JSON.stringify(report, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reportJson);
      toast.success("Resumo copiado para a área de transferência");
    } catch {
      toast.error("Não foi possível copiar. Use o botão Baixar.");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([reportJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-problema-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Relatório baixado");
  };

  const handleSend = async () => {
    setSending(true);
    try {
      // Persist as a high-severity entry in error_logs so the developer can review later.
      await logError({
        message: `[REPORTE] ${description.trim() || "Usuário reportou um problema"}`,
        source: "user.report",
        severity: "warning",
        route,
        context: report as unknown as Record<string, unknown>,
      });

      // Try to forward to n8n webhook if configured
      if (user?.id) {
        const { data: settings } = await supabase
          .from("settings")
          .select("webhook_url")
          .eq("user_id", user.id)
          .maybeSingle();
        const webhook = settings?.webhook_url;
        if (webhook) {
          try {
            await fetch(webhook, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "problem_report", report }),
            });
          } catch {
            /* ignore network failure, já persistimos */
          }
        }
      }

      toast.success("Relatório enviado. Obrigado!");
      setDescription("");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar relatório");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="hidden md:inline-flex items-center gap-1.5"
          aria-label="Reportar problema"
        >
          <Bug className="h-4 w-4" aria-hidden />
          <span>Reportar problema</span>
        </Button>
      </DialogTrigger>
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="outline"
          className="md:hidden"
          aria-label="Reportar problema"
        >
          <Bug className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reportar problema</DialogTitle>
          <DialogDescription>
            Descreva o que aconteceu. Vamos anexar rota atual, horário (São Paulo), últimas 10 ações e logs relevantes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="problem-description" className="text-sm font-medium text-foreground">
              O que não funcionou?
            </label>
            <Textarea
              id="problem-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: cliquei em Salvar em /financeiro e nada aconteceu..."
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="rounded-md border border-border bg-panel/40 p-3 text-xs">
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <div><span className="font-semibold text-foreground">Rota:</span> {route || "—"}</div>
              <div><span className="font-semibold text-foreground">Hora (SP):</span> {nowSP()}</div>
              <div><span className="font-semibold text-foreground">Ações:</span> {report.lastActions.length}</div>
              <div><span className="font-semibold text-foreground">Logs:</span> {report.debugEntries.length} debug · {report.recentErrors.length} erros</div>
            </div>
          </div>

          <details className="rounded-md border border-border bg-panel/40 p-3 text-xs">
            <summary className="cursor-pointer font-semibold text-foreground">Pré-visualizar JSON</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
              {reportJson}
            </pre>
          </details>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={handleCopy}>
              <Copy className="mr-1.5 h-4 w-4" /> Copiar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleDownload}>
              <Download className="mr-1.5 h-4 w-4" /> Baixar
            </Button>
          </div>
          <Button type="button" onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            Enviar para correção
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
