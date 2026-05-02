import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Trash2,
  Inbox,
  Filter,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { SectionCard } from "@/components/luize/section-card";
import { LoadingPanel } from "@/components/luize/loading-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type IngestLog = {
  id: string;
  created_at: string;
  source: string;
  auth_mode: string;
  status_code: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  rejected_count: number;
  total_received: number;
  error_message: string | null;
  rejected_details: unknown;
  request_id: string | null;
  duration_ms: number | null;
};

type StatusFilter = "all" | "success" | "partial" | "error";

function classifyStatus(log: IngestLog): StatusFilter {
  if (log.status_code >= 500 || log.status_code === 401 || log.status_code === 400 || log.status_code === 413 || log.status_code === 422) {
    return "error";
  }
  if (log.rejected_count > 0) return "partial";
  return "success";
}

function statusBadge(log: IngestLog) {
  const cls = classifyStatus(log);
  if (cls === "error") {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" /> erro
      </Badge>
    );
  }
  if (cls === "partial") {
    return (
      <Badge variant="outline" className="gap-1 border-warning text-warning">
        <AlertTriangle className="h-3 w-3" /> parcial
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-success text-success">
      <CheckCircle2 className="h-3 w-3" /> sucesso
    </Badge>
  );
}

function formatDateTime(value: string) {
  const d = new Date(value);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

const WebhookLogs = () => {
  useDocumentTitle("Logs do Webhook · Luize");
  const { user } = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<IngestLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<IngestLog | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("ingest_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast({ title: "Erro ao carregar logs", description: error.message, variant: "destructive" });
    } else {
      setLogs((data ?? []) as IngestLog[]);
    }
    setLoading(false);
  }, [user, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    return logs.reduce(
      (acc, l) => {
        acc.calls += 1;
        acc.inserted += l.inserted_count;
        acc.updated += l.updated_count ?? 0;
        acc.skipped += l.skipped_count;
        acc.rejected += l.rejected_count;
        if (classifyStatus(l) === "error") acc.errors += 1;
        return acc;
      },
      { calls: 0, inserted: 0, updated: 0, skipped: 0, rejected: 0, errors: 0 },
    );
  }, [logs]);

  const filtered = useMemo(() => {
    if (filter === "all") return logs;
    return logs.filter((l) => classifyStatus(l) === filter);
  }, [logs, filter]);

  const handleClear = async () => {
    if (!user) return;
    if (!confirm("Apagar todos os logs do webhook? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("ingest_logs").delete().eq("user_id", user.id);
    if (error) {
      toast({ title: "Erro ao limpar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Logs apagados" });
      void load();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/configuracoes"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar para Configurações
          </Link>
          <h1 className="mt-2 font-display text-3xl text-foreground">Logs do Webhook</h1>
          <p className="text-sm text-muted-foreground">
            Histórico das chamadas a <code className="rounded bg-muted px-1 py-0.5 text-xs">ingest-transactions</code> — últimas 200.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleClear} disabled={logs.length === 0}>
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Limpar
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-6">
        {[
          { label: "Chamadas", value: stats.calls },
          { label: "Inseridas", value: stats.inserted, tone: "text-success" },
          { label: "Atualizadas", value: stats.updated, tone: "text-secondary" },
          { label: "Ignoradas (dup)", value: stats.skipped, tone: "text-muted-foreground" },
          { label: "Rejeitadas", value: stats.rejected, tone: "text-warning" },
          { label: "Com erro", value: stats.errors, tone: "text-destructive" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-panel p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className={`mt-2 font-display text-3xl ${s.tone ?? "text-foreground"}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <SectionCard
        title="Chamadas recentes"
        description="Clique em uma linha para ver o detalhe completo (rejeições, erro, request_id)."
        eyebrow="webhook · ingest-transactions"
      >
        <div className="mb-4 flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="success">Apenas sucesso</SelectItem>
              <SelectItem value="partial">Sucesso parcial</SelectItem>
              <SelectItem value="error">Apenas erros</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <LoadingPanel lines={6} />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-10 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {logs.length === 0
                ? "Nenhuma chamada registrada ainda. Use o botão de teste no card do webhook para gerar uma."
                : "Nenhum log no filtro selecionado."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>HTTP</TableHead>
                  <TableHead>Auth</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Inseridas</TableHead>
                  <TableHead className="text-right">Atual.</TableHead>
                  <TableHead className="text-right">Skip</TableHead>
                  <TableHead className="text-right">Rej.</TableHead>
                  <TableHead className="text-right">Tempo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log) => (
                  <TableRow
                    key={log.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(log)}
                  >
                    <TableCell className="font-mono text-xs">{formatDateTime(log.created_at)}</TableCell>
                    <TableCell>{statusBadge(log)}</TableCell>
                    <TableCell className="font-mono text-xs">{log.status_code}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="secondary">{log.auth_mode}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{log.source}</TableCell>
                    <TableCell className="text-right font-mono text-success">{log.inserted_count}</TableCell>
                    <TableCell className="text-right font-mono text-secondary">{log.updated_count ?? 0}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{log.skipped_count}</TableCell>
                    <TableCell className="text-right font-mono text-warning">{log.rejected_count}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {log.duration_ms != null ? `${log.duration_ms}ms` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhe da chamada</DialogTitle>
            <DialogDescription>
              {selected && formatDateTime(selected.created_at)} · request_id{" "}
              <code className="text-xs">{selected?.request_id ?? "—"}</code>
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg border border-border bg-panel p-3">
                  <p className="text-xs text-muted-foreground">Inseridas</p>
                  <p className="font-display text-2xl text-success">{selected.inserted_count}</p>
                </div>
                <div className="rounded-lg border border-border bg-panel p-3">
                  <p className="text-xs text-muted-foreground">Ignoradas</p>
                  <p className="font-display text-2xl">{selected.skipped_count}</p>
                </div>
                <div className="rounded-lg border border-border bg-panel p-3">
                  <p className="text-xs text-muted-foreground">Rejeitadas</p>
                  <p className="font-display text-2xl text-warning">{selected.rejected_count}</p>
                </div>
              </div>

              {selected.error_message && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                  <p className="text-xs uppercase tracking-wider text-destructive">Erro</p>
                  <p className="mt-1 font-mono text-sm text-destructive">{selected.error_message}</p>
                </div>
              )}

              {Array.isArray(selected.rejected_details) && selected.rejected_details.length > 0 && (
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                    Itens rejeitados ({selected.rejected_details.length})
                  </p>
                  <div className="max-h-72 space-y-2 overflow-auto rounded-lg border border-border bg-panel p-3">
                    {(selected.rejected_details as Array<Record<string, unknown>>).map((item, i) => {
                      const idx = typeof item.index === "number" ? item.index : i;
                      const errs = Array.isArray(item.errors)
                        ? (item.errors as Array<{ field?: string; error?: string; received?: unknown }>)
                        : typeof item.error === "string"
                          ? [{ field: "_legacy", error: item.error as string }]
                          : [];
                      return (
                        <div key={i} className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs">
                          <div className="mb-1 flex items-center gap-2">
                            <Badge variant="outline" className="font-mono">
                              #{idx}
                            </Badge>
                            <span className="text-muted-foreground">
                              {errs.length} {errs.length === 1 ? "erro" : "erros"}
                            </span>
                          </div>
                          <ul className="space-y-1">
                            {errs.map((e, j) => (
                              <li key={j} className="flex flex-wrap items-baseline gap-2">
                                <code className="rounded bg-background px-1.5 py-0.5 text-warning">
                                  {e.field ?? "—"}
                                </code>
                                <span>{e.error}</span>
                                {e.received !== undefined && (
                                  <span className="text-muted-foreground">
                                    recebido:{" "}
                                    <code className="text-[10px]">
                                      {typeof e.received === "string"
                                        ? `"${e.received}"`
                                        : JSON.stringify(e.received)}
                                    </code>
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div>
                  <span className="text-foreground">HTTP:</span> {selected.status_code}
                </div>
                <div>
                  <span className="text-foreground">Duração:</span>{" "}
                  {selected.duration_ms != null ? `${selected.duration_ms}ms` : "—"}
                </div>
                <div>
                  <span className="text-foreground">Auth:</span> {selected.auth_mode}
                </div>
                <div>
                  <span className="text-foreground">Origem:</span> {selected.source}
                </div>
                <div>
                  <span className="text-foreground">Recebidas:</span> {selected.total_received}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WebhookLogs;
