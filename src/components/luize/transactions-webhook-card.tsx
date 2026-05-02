import { useMemo, useState } from "react";
import { Copy, PlayCircle, Webhook, CheckCircle2, AlertCircle } from "lucide-react";
import { SectionCard } from "@/components/luize/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/auth-provider";

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

type IngestResult = {
  ok: boolean;
  status: number;
  body: unknown;
};

export function TransactionsWebhookCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;
  const endpointUrl = useMemo(
    () => (projectId ? `https://${projectId}.supabase.co/functions/v1/ingest-transactions` : ""),
    [projectId],
  );

  const samplePayloadStr = useMemo(() => JSON.stringify(SAMPLE_PAYLOAD, null, 2), []);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copiado` });
    } catch {
      toast({ variant: "destructive", title: "Falha ao copiar" });
    }
  };

  const handleTest = async () => {
    if (!user) {
      toast({ variant: "destructive", title: "Faça login para testar" });
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ingest-transactions", {
        body: SAMPLE_PAYLOAD,
      });
      if (error) {
        setResult({ ok: false, status: 0, body: { error: error.message } });
        toast({ variant: "destructive", title: "Falha no teste", description: error.message });
      } else {
        const inserted = (data as { inserted?: number })?.inserted ?? 0;
        setResult({ ok: true, status: 200, body: data });
        toast({
          title: "Webhook respondeu",
          description: `Inseridas ${inserted} transação(ões) de exemplo.`,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      setResult({ ok: false, status: 0, body: { error: message } });
      toast({ variant: "destructive", title: "Falha no teste", description: message });
    } finally {
      setTesting(false);
    }
  };

  const curlExample = `curl -X POST '${endpointUrl}' \\
  -H 'Authorization: Bearer <SEU_JWT>' \\
  -H 'Content-Type: application/json' \\
  -d '${JSON.stringify(SAMPLE_PAYLOAD)}'`;

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

        {/* Test button */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-4">
          <Button type="button" onClick={handleTest} disabled={testing || !user}>
            <PlayCircle className="mr-2 size-4" />
            {testing ? "Enviando..." : "Testar com payload de exemplo"}
          </Button>
          {result && (
            <Badge
              variant={result.ok ? "default" : "destructive"}
              className="inline-flex items-center gap-1.5"
            >
              {result.ok ? <CheckCircle2 className="size-3" /> : <AlertCircle className="size-3" />}
              {result.ok ? "Sucesso" : "Falhou"}
            </Badge>
          )}
        </div>

        {result && (
          <pre className="max-h-48 overflow-auto rounded-lg border border-border/60 bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
            {JSON.stringify(result.body, null, 2)}
          </pre>
        )}

        <p className="text-xs text-muted-foreground">
          As transações importadas aparecem em <strong>Financeiro</strong> e contam para o cockpit. Reenviar com o mesmo{" "}
          <code className="rounded bg-muted px-1">external_id</code> é seguro — não duplica.
        </p>
      </div>
    </SectionCard>
  );
}
