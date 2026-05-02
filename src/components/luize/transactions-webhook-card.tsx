import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Copy,
  PlayCircle,
  CheckCircle2,
  AlertCircle,
  ScrollText,
  Sparkles,
  History,
  RotateCw,
  ArrowRight,
  Download,
  Code2,
  Eraser,
  Save,
} from "lucide-react";
import { SectionCard } from "@/components/luize/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/auth-provider";

const CUSTOM_PAYLOAD_STORAGE_KEY = "luize:webhook:custom-payload";

const SAMPLE_PAYLOAD = {
  transactions: [
    {
      external_id: "tb-2026-04-12-001",
      description: "Mercado Pão de Açúcar",
      amount: -342.9,
      date: "2026-04-12",
      category: "Alimentação",
      status: "pago",
      source: "tesouro-brilhante",
    },
    {
      external_id: "tb-2026-04-15-002",
      description: "Salário",
      amount: 12500,
      date: "2026-04-15",
      category: "Receitas",
      status: "pago",
      source: "tesouro-brilhante",
    },
  ],
};

// Payload realista simulando uma sincronização típica do Tesouro Brilhante:
// despesas recorrentes da casa, cartão, transporte, saúde e a folha mensal.
function buildTesouroBrilhantePayload() {
  const today = new Date();
  const iso = (offsetDays: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };
  // Sufixo aleatório evita colisão de external_id entre disparos sucessivos do botão
  const run = Math.random().toString(36).slice(2, 8);
  return {
    transactions: [
      {
        external_id: `tb-${iso(-3)}-mercado-${run}`,
        description: "Supermercado Pão de Açúcar — compra da semana",
        amount: -487.32,
        date: iso(-3),
        category: "Alimentação",
        status: "pago",
        source: "tesouro-brilhante",
      },
      {
        external_id: `tb-${iso(-2)}-uber-${run}`,
        description: "Uber — corridas da semana",
        amount: -86.4,
        date: iso(-2),
        category: "Transporte",
        status: "pago",
        source: "tesouro-brilhante",
      },
      {
        external_id: `tb-${iso(-1)}-farmacia-${run}`,
        description: "Drogaria São Paulo",
        amount: -132.55,
        date: iso(-1),
        category: "Saúde",
        status: "pago",
        source: "tesouro-brilhante",
      },
      {
        external_id: `tb-${iso(2)}-condominio-${run}`,
        description: "Condomínio — boleto mensal",
        amount: -1280,
        date: iso(2),
        category: "Moradia",
        status: "pendente",
        source: "tesouro-brilhante",
      },
      {
        external_id: `tb-${iso(7)}-fatura-c6-${run}`,
        description: "Fatura C6 Black",
        amount: -2147.18,
        date: iso(7),
        category: "Outros",
        status: "agendado",
        source: "tesouro-brilhante",
      },
      {
        external_id: `tb-${iso(5)}-salario-${run}`,
        description: "Salário — folha mensal",
        amount: 12500,
        date: iso(5),
        category: "Receitas",
        status: "pago",
        source: "tesouro-brilhante",
      },
    ],
  };
}

type IngestPayload = {
  transactions: unknown[];
  mode?: "upsert";
};

type IngestResult = {
  ok: boolean;
  status: number;
  /** Texto curto descrevendo o status (ex.: "OK", "Bad Request", "Network error") */
  statusText?: string;
  /** Latência total em milissegundos medida no cliente */
  durationMs: number;
  body: unknown;
  label: string;
  at: string;
  payload: IngestPayload;
  upsert: boolean;
  /** id of the previous run this one replays, if any — used to compute diffs */
  replayOfId?: string;
  id: string;
};

const HTTP_STATUS_TEXT: Record<number, string> = {
  200: "OK",
  201: "Created",
  204: "No Content",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  413: "Payload Too Large",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

const formatDuration = (ms: number) => {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
};

// Heurística para colorir a latência: verde < 500ms, âmbar < 1500ms, vermelho acima
const latencyTone = (ms: number) => {
  if (ms < 500) return "text-accent-green";
  if (ms < 1500) return "text-amber-400";
  return "text-destructive";
};


export function TransactionsWebhookCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [testing, setTesting] = useState<null | "sample" | "tesouro" | "custom">(null);
  const [history, setHistory] = useState<IngestResult[]>([]);
  const [upsertMode, setUpsertMode] = useState(false);
  const [customPayload, setCustomPayload] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Restaura último payload colado da sessão anterior
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_PAYLOAD_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { payload?: string; savedAt?: string };
        if (parsed.payload) setCustomPayload(parsed.payload);
        if (parsed.savedAt) setSavedAt(parsed.savedAt);
      }
    } catch {
      /* ignora corrupção */
    }
  }, []);

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;
  const endpointUrl = useMemo(
    () => (projectId ? `https://${projectId}.supabase.co/functions/v1/ingest-transactions` : ""),
    [projectId],
  );

  const [replayingId, setReplayingId] = useState<string | null>(null);

  const samplePayloadStr = useMemo(() => JSON.stringify(SAMPLE_PAYLOAD, null, 2), []);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copiado` });
    } catch {
      toast({ variant: "destructive", title: "Falha ao copiar" });
    }
  };

  const newId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const sendIngest = async (params: {
    payload: IngestPayload;
    upsert: boolean;
    label: string;
    replayOfId?: string;
  }) => {
    const { payload, upsert, label, replayOfId } = params;
    const at = new Date().toISOString();
    const id = newId();
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const elapsed = () => {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      return Math.max(0, now - startedAt);
    };

    try {
      const { data, error } = await supabase.functions.invoke("ingest-transactions", { body: payload });
      const durationMs = elapsed();
      if (error) {
        // FunctionsHttpError expõe o Response real em error.context — extrai status e body reais
        const ctx = (error as unknown as { context?: Response }).context;
        let status = 0;
        let statusText: string | undefined;
        let body: unknown = { error: error.message };
        if (ctx && typeof ctx === "object" && "status" in ctx) {
          status = ctx.status ?? 0;
          statusText = ctx.statusText || HTTP_STATUS_TEXT[status];
          try {
            const cloned = ctx.clone();
            const text = await cloned.text();
            try {
              body = text ? JSON.parse(text) : { error: error.message };
            } catch {
              body = { error: error.message, raw: text };
            }
          } catch {
            /* corpo já consumido */
          }
        } else {
          statusText = "Network error";
        }
        const entry: IngestResult = {
          ok: false,
          status,
          statusText,
          durationMs,
          body,
          label,
          at,
          payload,
          upsert,
          replayOfId,
          id,
        };
        setHistory((h) => [entry, ...h].slice(0, 5));
        toast({
          variant: "destructive",
          title: `Falha no teste${status ? ` · HTTP ${status}` : ""}`,
          description: `${error.message} · ${formatDuration(durationMs)}`,
        });
      } else {
        const inserted = (data as { inserted?: number })?.inserted ?? 0;
        const updated = (data as { updated?: number })?.updated ?? 0;
        const skipped = (data as { skipped?: number })?.skipped ?? 0;
        const entry: IngestResult = {
          ok: true,
          status: 200,
          statusText: "OK",
          durationMs,
          body: data,
          label,
          at,
          payload,
          upsert,
          replayOfId,
          id,
        };
        setHistory((h) => [entry, ...h].slice(0, 5));
        toast({
          title: `${replayOfId ? "Replay" : "Webhook"} respondeu · ${formatDuration(durationMs)}`,
          description: upsert
            ? `Inseridas ${inserted}, atualizadas ${updated}, ignoradas ${skipped}.`
            : `Inseridas ${inserted}, ignoradas ${skipped}.`,
        });
      }
    } catch (err) {
      const durationMs = elapsed();
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      const entry: IngestResult = {
        ok: false,
        status: 0,
        statusText: "Network error",
        durationMs,
        body: { error: message },
        label,
        at,
        payload,
        upsert,
        replayOfId,
        id,
      };
      setHistory((h) => [entry, ...h].slice(0, 5));
      toast({
        variant: "destructive",
        title: "Falha no teste",
        description: `${message} · ${formatDuration(durationMs)}`,
      });
    }
  };

  const runTest = async (variant: "sample" | "tesouro") => {
    if (!user) {
      toast({ variant: "destructive", title: "Faça login para testar" });
      return;
    }
    setTesting(variant);
    const basePayload = variant === "tesouro" ? buildTesouroBrilhantePayload() : SAMPLE_PAYLOAD;
    const payload: IngestPayload = upsertMode ? { ...basePayload, mode: "upsert" } : basePayload;
    const label =
      variant === "tesouro"
        ? `Tesouro Brilhante · ${basePayload.transactions.length} txs${upsertMode ? " · upsert" : ""}`
        : `Payload de exemplo${upsertMode ? " · upsert" : ""}`;
    try {
      await sendIngest({ payload, upsert: upsertMode, label });
    } finally {
      setTesting(null);
    }
  };

  const replayEntry = async (entry: IngestResult) => {
    if (!user) {
      toast({ variant: "destructive", title: "Faça login para repetir" });
      return;
    }
    setReplayingId(entry.id);
    const count = Array.isArray(entry.payload.transactions) ? entry.payload.transactions.length : 0;
    const label = `↻ Replay · ${count} txs${entry.upsert ? " · upsert" : ""}`;
    try {
      await sendIngest({
        payload: entry.payload,
        upsert: entry.upsert,
        label,
        replayOfId: entry.id,
      });
    } finally {
      setReplayingId(null);
    }
  };

  // Normaliza payload colado: aceita array direto ou { transactions: [...] }
  const parseCustomPayload = (raw: string): { payload: IngestPayload; count: number } => {
    const trimmed = raw.trim();
    if (!trimmed) throw new Error("Cole um JSON antes de testar.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "JSON inválido";
      throw new Error(`JSON inválido: ${msg}`);
    }
    let txs: unknown[];
    let extras: Record<string, unknown> = {};
    if (Array.isArray(parsed)) {
      txs = parsed;
    } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { transactions?: unknown }).transactions)) {
      txs = (parsed as { transactions: unknown[] }).transactions;
      extras = { ...(parsed as Record<string, unknown>) };
      delete extras.transactions;
    } else {
      throw new Error("O JSON precisa ser um array ou conter a chave 'transactions'.");
    }
    if (txs.length === 0) throw new Error("Nenhuma transação no payload.");
    if (txs.length > 500) throw new Error(`Máximo 500 transações por chamada (recebido: ${txs.length}).`);
    const payload: IngestPayload = { ...extras, transactions: txs };
    if (upsertMode) payload.mode = "upsert";
    return { payload, count: txs.length };
  };

  const persistCustomPayload = (raw: string) => {
    try {
      const at = new Date().toISOString();
      localStorage.setItem(CUSTOM_PAYLOAD_STORAGE_KEY, JSON.stringify({ payload: raw, savedAt: at }));
      setSavedAt(at);
    } catch {
      /* quota cheia: ignora */
    }
  };

  const runCustomTest = async () => {
    if (!user) {
      toast({ variant: "destructive", title: "Faça login para testar" });
      return;
    }
    let prepared: { payload: IngestPayload; count: number };
    try {
      prepared = parseCustomPayload(customPayload);
      setCustomError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Payload inválido";
      setCustomError(msg);
      toast({ variant: "destructive", title: "Payload inválido", description: msg });
      return;
    }
    persistCustomPayload(customPayload);
    setTesting("custom");
    const label = `Payload customizado · ${prepared.count} txs${upsertMode ? " · upsert" : ""}`;
    try {
      await sendIngest({ payload: prepared.payload, upsert: upsertMode, label });
    } finally {
      setTesting(null);
    }
  };

  const formatCustomPayload = () => {
    try {
      const parsed = JSON.parse(customPayload);
      const pretty = JSON.stringify(parsed, null, 2);
      setCustomPayload(pretty);
      setCustomError(null);
      toast({ title: "JSON formatado" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "JSON inválido";
      setCustomError(msg);
      toast({ variant: "destructive", title: "Não foi possível formatar", description: msg });
    }
  };

  const loadSampleIntoEditor = () => {
    setCustomPayload(JSON.stringify(SAMPLE_PAYLOAD, null, 2));
    setCustomError(null);
  };

  const loadTesouroIntoEditor = () => {
    setCustomPayload(JSON.stringify(buildTesouroBrilhantePayload(), null, 2));
    setCustomError(null);
  };

  const clearCustomPayload = () => {
    setCustomPayload("");
    setCustomError(null);
    try {
      localStorage.removeItem(CUSTOM_PAYLOAD_STORAGE_KEY);
    } catch { /* noop */ }
    setSavedAt(null);
  };

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportHistory = (format: "json" | "csv") => {
    if (history.length === 0) return;
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    if (format === "json") {
      const payload = {
        exported_at: new Date().toISOString(),
        user_id: user?.id ?? null,
        endpoint: endpointUrl,
        count: history.length,
        runs: history,
      };
      downloadFile(JSON.stringify(payload, null, 2), `luize-webhook-historico-${ts}.json`, "application/json");
      toast({ title: "Histórico exportado (JSON)" });
      return;
    }
    // CSV — uma linha por execução, com contagens e snippet do body
    const headers = [
      "id",
      "at",
      "label",
      "ok",
      "status",
      "status_text",
      "duration_ms",
      "upsert",
      "replay_of_id",
      "tx_count",
      "inserted",
      "updated",
      "skipped",
      "rejected",
      "unmapped_categories",
      "body",
    ];
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return `"${s.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
    };
    const rows = history.map((entry) => {
      const body = entry.body as
        | {
            inserted?: number;
            updated?: number;
            skipped?: number;
            rejected?: number;
            unmapped_categories?: string[];
          }
        | undefined;
      const txCount = Array.isArray(entry.payload.transactions) ? entry.payload.transactions.length : 0;
      return [
        entry.id,
        entry.at,
        entry.label,
        entry.ok,
        entry.status,
        entry.statusText ?? "",
        Math.round(entry.durationMs),
        entry.upsert,
        entry.replayOfId ?? "",
        txCount,
        body?.inserted ?? "",
        body?.updated ?? "",
        body?.skipped ?? "",
        body?.rejected ?? "",
        (body?.unmapped_categories ?? []).join("|"),
        JSON.stringify(entry.body),
      ].map(escape).join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    downloadFile(csv, `luize-webhook-historico-${ts}.csv`, "text/csv;charset=utf-8");
    toast({ title: "Histórico exportado (CSV)" });
  };

  const curlPayload = upsertMode ? { ...SAMPLE_PAYLOAD, mode: "upsert" } : SAMPLE_PAYLOAD;
  const curlEndpoint = upsertMode ? `${endpointUrl}?upsert=true` : endpointUrl;
  const curlExample = `curl -X POST '${curlEndpoint}' \\
  -H 'Authorization: Bearer <SEU_JWT>' \\
  -H 'Content-Type: application/json' \\
  -d '${JSON.stringify(curlPayload)}'`;

  return (
    <SectionCard
      title="Webhook de Transações"
      description="Importe ou reconcilie transações do Tesouro Brilhante, n8n, Zapier ou qualquer backend"
      eyebrow="Integração financeira"
    >
      <div className="space-y-5">
        {/* Endpoint */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Endpoint</label>
          <div className="flex items-center gap-2">
            <Input value={endpointUrl} readOnly className="font-mono text-xs" />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={() => copy(endpointUrl, "Endpoint")}
              disabled={!endpointUrl}
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Aceita <code className="rounded bg-muted px-1">POST</code> com array de transações ou{" "}
            <code className="rounded bg-muted px-1">{"{ transactions: [...] }"}</code>. Máx. 500 por chamada. Deduplica por{" "}
            <code className="rounded bg-muted px-1">external_id</code>.
          </p>
        </div>

        {/* Auth modes */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Badge variant="secondary">Modo 1</Badge> JWT do app
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              <code className="rounded bg-muted px-1">Authorization: Bearer &lt;JWT&gt;</code>
              <br /> Use quando chamar do frontend logado. Respeita RLS.
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Badge variant="secondary">Modo 2</Badge> API Key externa
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              <code className="rounded bg-muted px-1">X-Luize-Api-Key</code> +{" "}
              <code className="rounded bg-muted px-1">X-Luize-User-Id</code>
              <br /> Para Tesouro Brilhante / n8n. Requer secret{" "}
              <code className="rounded bg-muted px-1">LUIZE_INGEST_API_KEY</code> no servidor.
            </p>
          </div>
        </div>

        {/* Sample payload */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Exemplo de payload</label>
            <Button type="button" variant="ghost" size="sm" onClick={() => copy(samplePayloadStr, "Payload")}>
              <Copy className="mr-1.5 size-3.5" /> Copiar
            </Button>
          </div>
          <pre className="max-h-60 overflow-auto rounded-lg border border-border/60 bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
            {samplePayloadStr}
          </pre>
        </div>

        {/* cURL */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Exemplo cURL</label>
            <Button type="button" variant="ghost" size="sm" onClick={() => copy(curlExample, "Comando cURL")}>
              <Copy className="mr-1.5 size-3.5" /> Copiar
            </Button>
          </div>
          <pre className="max-h-40 overflow-auto rounded-lg border border-border/60 bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
            {curlExample}
          </pre>
        </div>

        {/* Modo upsert */}
        <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
          <Switch id="upsert-mode" checked={upsertMode} onCheckedChange={setUpsertMode} />
          <div className="space-y-1">
            <Label htmlFor="upsert-mode" className="cursor-pointer text-sm font-medium">
              Modo upsert (atualizar existentes)
            </Label>
            <p className="text-xs text-muted-foreground">
              Quando ligado, transações com <code className="rounded bg-muted px-1">external_id</code> já
              existente são <strong>atualizadas</strong> em vez de ignoradas. Equivale a enviar{" "}
              <code className="rounded bg-muted px-1">?upsert=true</code> na URL ou{" "}
              <code className="rounded bg-muted px-1">{"{ mode: \"upsert\" }"}</code> no body.
            </p>
          </div>
        </div>

        {/* Editor de payload customizado */}
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Code2 className="size-4 text-muted-foreground" />
              Editor de payload
              {savedAt && (
                <Badge variant="outline" className="inline-flex items-center gap-1 text-[10px]">
                  <Save className="size-3" /> salvo {new Date(savedAt).toLocaleString("pt-BR")}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={loadSampleIntoEditor}>
                Exemplo
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={loadTesouroIntoEditor}>
                Tesouro Brilhante
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={formatCustomPayload} disabled={!customPayload.trim()}>
                Formatar
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={clearCustomPayload} disabled={!customPayload && !savedAt}>
                <Eraser className="mr-1 size-3" /> Limpar
              </Button>
            </div>
          </div>
          <Textarea
            value={customPayload}
            onChange={(e) => {
              setCustomPayload(e.target.value);
              if (customError) setCustomError(null);
            }}
            placeholder='Cole um JSON aqui — pode ser um array de transações ou { "transactions": [...] }'
            className="min-h-[180px] font-mono text-[11px] leading-relaxed"
            spellCheck={false}
          />
          {customError ? (
            <p className="flex items-start gap-1.5 text-[11px] text-destructive">
              <AlertCircle className="mt-0.5 size-3 shrink-0" /> {customError}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              O último payload colado fica salvo neste navegador para reuso. Validamos o JSON antes de enviar e respeitamos o modo upsert acima.
            </p>
          )}
        </div>

        {/* Test buttons */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-4">
          <Button
            type="button"
            onClick={() => runTest("sample")}
            disabled={testing !== null || !user}
            variant="outline"
          >
            <PlayCircle className="mr-2 size-4" />
            {testing === "sample" ? "Enviando..." : "Testar payload simples"}
          </Button>
          <Button
            type="button"
            onClick={() => runTest("tesouro")}
            disabled={testing !== null || !user}
          >
            <Sparkles className="mr-2 size-4" />
            {testing === "tesouro" ? "Enviando..." : "Testar com Tesouro Brilhante"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={runCustomTest}
            disabled={testing !== null || !user || !customPayload.trim()}
          >
            <Code2 className="mr-2 size-4" />
            {testing === "custom" ? "Enviando..." : "Testar payload colado"}
          </Button>
          <Button type="button" variant="ghost" asChild>
            <Link to="/configuracoes/webhook-logs">
              <ScrollText className="mr-2 size-4" />
              Ver logs e histórico
            </Link>
          </Button>
        </div>

        {/* Histórico das execuções */}
        {history.length > 0 && (
          <div className="space-y-2 border-t border-border/60 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <History className="size-4 text-muted-foreground" />
                Histórico desta sessão
                <Badge variant="secondary" className="text-[10px]">{history.length}/5</Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => exportHistory("json")}
                  title="Baixar histórico desta sessão como JSON"
                >
                  <Download className="mr-1 size-3" /> JSON
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => exportHistory("csv")}
                  title="Baixar histórico desta sessão como CSV"
                >
                  <Download className="mr-1 size-3" /> CSV
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setHistory([])}>
                  Limpar
                </Button>
              </div>
            </div>
            <ul className="space-y-2">
              {history.map((entry) => {
                const body = entry.body as
                  | {
                      inserted?: number;
                      updated?: number;
                      skipped?: number;
                      rejected?: number;
                      unmapped_categories?: string[];
                    }
                  | undefined;
                const inserted = body?.inserted ?? 0;
                const updated = body?.updated ?? 0;
                const skipped = body?.skipped ?? 0;
                const rejected = body?.rejected ?? 0;
                const unmapped = body?.unmapped_categories ?? [];
                const isReplaying = replayingId === entry.id;

                // Compara este replay com a execução original para destacar mudança do upsert
                const original = entry.replayOfId
                  ? history.find((h) => h.id === entry.replayOfId)
                  : undefined;
                const originalBody = original?.body as
                  | { inserted?: number; updated?: number; skipped?: number }
                  | undefined;
                const diff = entry.ok && original?.ok
                  ? {
                      inserted: inserted - (originalBody?.inserted ?? 0),
                      updated: updated - (originalBody?.updated ?? 0),
                      skipped: skipped - (originalBody?.skipped ?? 0),
                    }
                  : null;
                const fmtDelta = (n: number) => (n > 0 ? `+${n}` : `${n}`);

                return (
                  <li key={entry.id} className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={entry.ok ? "default" : "destructive"}
                          className="inline-flex items-center gap-1.5"
                        >
                          {entry.ok ? <CheckCircle2 className="size-3" /> : <AlertCircle className="size-3" />}
                          {entry.ok ? "Sucesso" : "Falhou"}
                        </Badge>
                        {entry.replayOfId && (
                          <Badge variant="outline" className="inline-flex items-center gap-1 text-[10px]">
                            <RotateCw className="size-3" /> replay
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className="inline-flex items-center gap-1 font-mono text-[10px]"
                          title={entry.statusText ? `${entry.status} ${entry.statusText}` : `HTTP ${entry.status}`}
                        >
                          HTTP {entry.status || "—"}
                          {entry.statusText && (
                            <span className="text-muted-foreground">· {entry.statusText}</span>
                          )}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`inline-flex items-center gap-1 font-mono text-[10px] ${latencyTone(entry.durationMs)}`}
                          title="Latência total medida no cliente (rede + execução do edge function)"
                        >
                          ⏱ {formatDuration(entry.durationMs)}
                        </Badge>
                        <span className="font-medium text-foreground">{entry.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {new Date(entry.at).toLocaleTimeString("pt-BR")}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => replayEntry(entry)}
                          disabled={replayingId !== null || testing !== null || !user}
                          title="Reenvia exatamente o mesmo payload"
                        >
                          <RotateCw className={`mr-1 size-3 ${isReplaying ? "animate-spin" : ""}`} />
                          {isReplaying ? "Repetindo..." : "Repetir teste"}
                        </Button>
                      </div>
                    </div>
                    {entry.ok && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant="secondary" className="text-[10px]">Inseridas: {inserted}</Badge>
                        {updated > 0 && (
                          <Badge variant="secondary" className="text-[10px]">Atualizadas: {updated}</Badge>
                        )}
                        <Badge variant="secondary" className="text-[10px]">Ignoradas: {skipped}</Badge>
                        {rejected > 0 && (
                          <Badge variant="destructive" className="text-[10px]">Rejeitadas: {rejected}</Badge>
                        )}
                        {unmapped.length > 0 && (
                          <Badge variant="outline" className="text-[10px]">
                            Sem mapeamento: {unmapped.slice(0, 3).join(", ")}
                            {unmapped.length > 3 ? ` +${unmapped.length - 3}` : ""}
                          </Badge>
                        )}
                      </div>
                    )}
                    {diff && (diff.inserted !== 0 || diff.updated !== 0 || diff.skipped !== 0) && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded border border-accent-blue/30 bg-accent-blue/5 px-2 py-1.5 text-[10px] text-muted-foreground">
                        <ArrowRight className="size-3 text-accent-blue" />
                        <span className="font-medium text-foreground">vs. original:</span>
                        <span className={diff.inserted < 0 ? "text-accent-green" : diff.inserted > 0 ? "text-amber-400" : ""}>
                          inseridas {fmtDelta(diff.inserted)}
                        </span>
                        <span className={diff.updated > 0 ? "text-accent-blue" : ""}>
                          · atualizadas {fmtDelta(diff.updated)}
                        </span>
                        <span>· ignoradas {fmtDelta(diff.skipped)}</span>
                        <Badge variant="outline" className="ml-auto text-[10px]">
                          upsert {entry.upsert ? "ON" : "OFF"}
                        </Badge>
                      </div>
                    )}
                    <pre className="mt-2 max-h-32 overflow-auto rounded border border-border/40 bg-background/40 p-2 font-mono text-[10px] leading-relaxed">
                      {JSON.stringify(entry.body, null, 2)}
                    </pre>
                  </li>
                );
              })}

            </ul>
          </div>
        )}


        <p className="text-xs text-muted-foreground">
          As transações importadas aparecem em <strong>Financeiro</strong> e contam para o cockpit. Reenviar com o mesmo{" "}
          <code className="rounded bg-muted px-1">external_id</code> é seguro — não duplica.
        </p>
      </div>
    </SectionCard>
  );
}
