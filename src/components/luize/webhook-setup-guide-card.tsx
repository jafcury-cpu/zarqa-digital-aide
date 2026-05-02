import { useMemo, useState } from "react";
import {
  BookOpen,
  Copy,
  KeyRound,
  Network,
  ShieldCheck,
  Terminal,
  Workflow,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { SectionCard } from "@/components/luize/section-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/auth-provider";

type Step = {
  n: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: React.ReactNode;
};

export function WebhookSetupGuideCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [revealUserId, setRevealUserId] = useState(false);

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;
  const endpointUrl = useMemo(
    () => (projectId ? `https://${projectId}.supabase.co/functions/v1/ingest-transactions` : ""),
    [projectId],
  );

  const userId = user?.id ?? "";
  const maskedUserId = userId
    ? `${userId.slice(0, 8)}…${userId.slice(-4)}`
    : "faça login para ver";

  const copy = async (value: string, label: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copiado` });
    } catch {
      toast({ variant: "destructive", title: "Falha ao copiar" });
    }
  };

  const n8nHeadersJson = `{
  "X-Luize-Api-Key": "{{$env.LUIZE_INGEST_API_KEY}}",
  "X-Luize-User-Id": "${userId || "<SEU_USER_ID>"}",
  "Content-Type": "application/json"
}`;

  const tbBodyExample = `{
  "transactions": [
    {
      "external_id": "tb-{{$json.id}}",
      "description": "{{$json.descricao}}",
      "amount": {{$json.valor}},
      "date": "{{$json.data}}",
      "category": "{{$json.categoria}}",
      "status": "{{$json.status}}",
      "source": "tesouro-brilhante"
    }
  ],
  "mode": "upsert"
}`;

  const curlReal = `curl -X POST '${endpointUrl || "<ENDPOINT>"}' \\
  -H 'X-Luize-Api-Key: <SUA_API_KEY>' \\
  -H 'X-Luize-User-Id: ${userId || "<SEU_USER_ID>"}' \\
  -H 'Content-Type: application/json' \\
  -d '{"transactions":[{"external_id":"tb-001","description":"Mercado","amount":-120.5,"date":"2026-05-02","category":"Alimentação","status":"pago","source":"tesouro-brilhante"}]}'`;

  const steps: Step[] = [
    {
      n: 1,
      icon: KeyRound,
      title: "Gerar a API key da ingestão",
      body: (
        <>
          <p>
            A autenticação por header usa o secret{" "}
            <code className="rounded bg-muted px-1">LUIZE_INGEST_API_KEY</code> guardado no
            backend (Lovable Cloud). Ele <strong>nunca</strong> deve viver em código do
            frontend nem em planilhas.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            <li>
              Gere uma string aleatória forte (ex.: <code className="rounded bg-muted px-1">openssl rand -hex 32</code>).
            </li>
            <li>
              Salve no backend como secret <code className="rounded bg-muted px-1">LUIZE_INGEST_API_KEY</code>.
            </li>
            <li>Guarde uma cópia no n8n (passo 3) — depois disso, não precisa mais lembrar dela.</li>
          </ul>
        </>
      ),
    },
    {
      n: 2,
      icon: Network,
      title: "Copiar endpoint e seu User ID",
      body: (
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Endpoint</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => copy(endpointUrl, "Endpoint")}
                disabled={!endpointUrl}
              >
                <Copy className="mr-1.5 size-3.5" /> Copiar
              </Button>
            </div>
            <code className="block break-all rounded-md border border-border/60 bg-muted/40 px-2 py-1.5 font-mono text-[11px]">
              {endpointUrl || "indisponível — projeto sem VITE_SUPABASE_PROJECT_ID"}
            </code>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Seu User ID (cabeçalho <code className="rounded bg-muted px-1">X-Luize-User-Id</code>)
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRevealUserId((v) => !v)}
                  disabled={!userId}
                >
                  {revealUserId ? "Ocultar" : "Mostrar"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => copy(userId, "User ID")}
                  disabled={!userId}
                >
                  <Copy className="mr-1.5 size-3.5" /> Copiar
                </Button>
              </div>
            </div>
            <code className="block break-all rounded-md border border-border/60 bg-muted/40 px-2 py-1.5 font-mono text-[11px]">
              {revealUserId ? userId || "—" : maskedUserId}
            </code>
            <p className="mt-1 text-xs text-muted-foreground">
              Este UUID identifica <strong>você</strong>. Combinado com a API key, o backend insere as
              transações na sua conta.
            </p>
          </div>
        </div>
      ),
    },
    {
      n: 3,
      icon: Workflow,
      title: "Configurar o nó HTTP Request no n8n",
      body: (
        <div className="space-y-3 text-xs">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              No n8n, crie/abra o workflow do <strong>Tesouro Brilhante</strong>.
            </li>
            <li>
              Adicione um nó <strong>HTTP Request</strong> ao final (depois de buscar/transformar suas transações).
            </li>
            <li>
              Em <em>Settings → Variables</em> (ou Credentials), salve a chave como variável de ambiente{" "}
              <code className="rounded bg-muted px-1">LUIZE_INGEST_API_KEY</code>.
            </li>
            <li>
              Configure o nó com:
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                <li>
                  <strong>Method</strong>: <code className="rounded bg-muted px-1">POST</code>
                </li>
                <li>
                  <strong>URL</strong>: o endpoint do passo 2
                </li>
                <li>
                  <strong>Authentication</strong>: <em>None</em> (autenticamos via headers)
                </li>
                <li>
                  <strong>Send Headers</strong>: ligado, modo JSON
                </li>
                <li>
                  <strong>Send Body</strong>: ligado, modo JSON
                </li>
              </ul>
            </li>
          </ol>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium text-muted-foreground">Headers (JSON)</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => copy(n8nHeadersJson, "Headers")}>
                <Copy className="mr-1.5 size-3.5" /> Copiar
              </Button>
            </div>
            <pre className="overflow-auto rounded-md border border-border/60 bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
              {n8nHeadersJson}
            </pre>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium text-muted-foreground">
                Body (JSON) — adapte os <code className="rounded bg-muted px-1">{"{{$json.*}}"}</code> aos seus campos
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => copy(tbBodyExample, "Body")}>
                <Copy className="mr-1.5 size-3.5" /> Copiar
              </Button>
            </div>
            <pre className="overflow-auto rounded-md border border-border/60 bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
              {tbBodyExample}
            </pre>
            <p className="mt-1 text-muted-foreground">
              <code className="rounded bg-muted px-1">mode: "upsert"</code> faz reenvios atualizarem em vez de
              ignorarem (usa <code className="rounded bg-muted px-1">external_id</code> para casar).
            </p>
          </div>
        </div>
      ),
    },
    {
      n: 4,
      icon: Terminal,
      title: "Validar com cURL antes de ligar o workflow",
      body: (
        <div className="space-y-2">
          <p className="text-xs">
            Rode no seu terminal (substitua <code className="rounded bg-muted px-1">&lt;SUA_API_KEY&gt;</code>):
          </p>
          <div className="flex items-center justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => copy(curlReal, "cURL real")}>
              <Copy className="mr-1.5 size-3.5" /> Copiar cURL
            </Button>
          </div>
          <pre className="max-h-48 overflow-auto rounded-md border border-border/60 bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
            {curlReal}
          </pre>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>
              Resposta esperada: HTTP 200 com{" "}
              <code className="rounded bg-muted px-1">{"{ inserted, skipped, updated, ... }"}</code>.
            </li>
            <li>
              <span className="inline-flex items-center gap-1">
                <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                  401
                </Badge>
                API key ausente/errada — confira o secret no backend.
              </span>
            </li>
            <li>
              <span className="inline-flex items-center gap-1">
                <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                  400
                </Badge>
                User ID inválido ou payload malformado — veja{" "}
                <strong>Logs do webhook</strong> para o detalhe por item.
              </span>
            </li>
          </ul>
        </div>
      ),
    },
    {
      n: 5,
      icon: ShieldCheck,
      title: "Boas práticas e troubleshooting",
      body: (
        <ul className="list-disc space-y-1 pl-5 text-xs">
          <li>
            <strong>Sempre</strong> envie <code className="rounded bg-muted px-1">external_id</code> estável (ex.:{" "}
            <code className="rounded bg-muted px-1">tb-&lt;id-da-fonte&gt;</code>) — é o que evita duplicar.
          </li>
          <li>
            Mande lotes de até <strong>500 transações</strong> por request. Para volumes maiores, paginar no n8n.
          </li>
          <li>
            Categorias desconhecidas caem em <em>Outros</em> e aparecem em{" "}
            <strong>Mapeamento de categorias</strong> para você associar.
          </li>
          <li>
            Nunca exponha <code className="rounded bg-muted px-1">X-Luize-Api-Key</code> em frontend, repositório
            público ou logs. Se vazar, gere outra e atualize o secret.
          </li>
          <li>
            Acompanhe cada chamada em <strong>Configurações → Logs do webhook</strong> (inserted/skipped/updated/erros).
          </li>
        </ul>
      ),
    },
  ];

  return (
    <SectionCard
      title="Como conectar o n8n / Tesouro Brilhante"
      description="Passo a passo para enviar transações com X-Luize-Api-Key + X-Luize-User-Id"
      eyebrow="Documentação da integração"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-accent-blue/30 bg-accent-blue/5 p-3 text-xs">
          <BookOpen className="mt-0.5 size-4 shrink-0 text-accent-blue" />
          <p className="text-muted-foreground">
            Use este guia quando o chamador <strong>não é o app Luize logado</strong> (ex.: workflow do n8n,
            cron, script). Para chamadas a partir do frontend autenticado, use o JWT — veja o card{" "}
            <strong>Webhook de Transações</strong> acima.
          </p>
        </div>

        <ol className="space-y-4">
          {steps.map(({ n, icon: Icon, title, body }) => (
            <li key={n} className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {n}
                </span>
                <Icon className="size-4 text-accent-blue" />
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">{body}</div>
            </li>
          ))}
        </ol>

        <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent-green" />
          <p className="text-muted-foreground">
            Tudo pronto? As transações importadas aparecem automaticamente em <strong>Financeiro</strong> e
            alimentam o cockpit. Reenviar o mesmo <code className="rounded bg-muted px-1">external_id</code> é
            seguro: sem upsert, é ignorado; com upsert, é atualizado.
          </p>
        </div>

        {!user && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <p className="text-muted-foreground">
              Faça login para ver e copiar o seu <strong>User ID</strong> nos exemplos.
            </p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
