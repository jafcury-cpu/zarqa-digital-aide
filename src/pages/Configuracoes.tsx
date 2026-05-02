import { t } from "@/lib/i18n";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { BellRing, Copy, Link2, Save, Send, BellOff, Radio, Check, X, Bug } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { SectionCard } from "@/components/luize/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast as sonnerToast } from "sonner";
import {
  appendRealtimeEvent,
  CHAT_PREFS_CHANGED_EVENT,
  getRealtimeToastSeverity,
  getTabId,
  REALTIME_TOAST_SEVERITY_KEY,
  setRealtimeToastSeverity,
  shouldShowRealtimeToast,
  type RealtimeToastSeverity,
  type PersistedRealtimeStatus,
} from "@/lib/chat-preferences";
import {
  fetchRealtimeToastSeverityFromCloud,
  pushRealtimeToastSeverityToCloud,
} from "@/lib/realtime-toast-severity-cloud";
import {
  DEBUG_MODE_CHANGED_EVENT,
  isDebugModeEnabled,
  pushDebug,
  setDebugModeEnabled,
} from "@/lib/debug-mode";
import { TransactionsWebhookCard } from "@/components/luize/transactions-webhook-card";

function validateWebhookUrl(value: string) {
  if (!value.trim()) return null;

  try {
    const parsedUrl = new URL(value);
    if (parsedUrl.protocol !== "https:") {
      return "Use uma URL HTTPS.";
    }

    if (["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(parsedUrl.hostname.toLowerCase())) {
      return "Use um domínio público permitido pelo backend.";
    }

    if (parsedUrl.username || parsedUrl.password) {
      return "Remova credenciais embutidas da URL do webhook.";
    }

    return null;
  } catch {
    return "Informe uma webhook URL válida.";
  }
}

const Configuracoes = () => {
  useDocumentTitle("Configurações");
  const { user } = useAuth();
  const { toast } = useToast();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastSeverity, setToastSeverity] = useState<RealtimeToastSeverity>(() => getRealtimeToastSeverity());
  const [debugMode, setDebugMode] = useState<boolean>(() => isDebugModeEnabled());

  // Sync debug mode toggle across tabs
  useEffect(() => {
    const sync = () => setDebugMode(isDebugModeEnabled());
    window.addEventListener(DEBUG_MODE_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DEBUG_MODE_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Cross-tab + same-tab sync: keep the select in sync if the preference changes elsewhere
  useEffect(() => {
    const sync = () => {
      const next = getRealtimeToastSeverity();
      setToastSeverity((current) => (current === next ? current : next));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === REALTIME_TOAST_SEVERITY_KEY) sync();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHAT_PREFS_CHANGED_EVENT, sync);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHAT_PREFS_CHANGED_EVENT, sync);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  const webhookError = useMemo(() => validateWebhookUrl(webhookUrl), [webhookUrl]);

  const supabaseProjectId = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
  const telegramWebhookUrl = supabaseProjectId
    ? `https://${supabaseProjectId}.supabase.co/functions/v1/telegram-webhook`
    : "";

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const loadSettings = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("settings")
        .select("webhook_url, timezone, telegram_bot_token, telegram_chat_id, realtime_toast_severity")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) {
        toast({ variant: "destructive", title: "Falha ao carregar configurações", description: error.message });
      } else if (data) {
        setWebhookUrl(data.webhook_url ?? "");
        setTimezone(data.timezone ?? "America/Sao_Paulo");
        setTelegramBotToken(data.telegram_bot_token ?? "");
        setTelegramChatId(data.telegram_chat_id ?? "");
        // Adopt cloud severity if it differs from the local cache, so the
        // preference follows the user across devices.
        const cloudSeverity = (data as { realtime_toast_severity?: unknown }).realtime_toast_severity;
        if (
          typeof cloudSeverity === "string" &&
          (["all", "warnings_and_errors", "errors_only", "none"] as const).includes(
            cloudSeverity as RealtimeToastSeverity,
          ) &&
          cloudSeverity !== getRealtimeToastSeverity()
        ) {
          const next = cloudSeverity as RealtimeToastSeverity;
          setRealtimeToastSeverity(next); // updates cache + emits CHAT_PREFS_CHANGED_EVENT
          setToastSeverity(next);
        }
      }
      setLoading(false);
    };

    void loadSettings();
  }, [toast, user]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;

    if (webhookError) {
      toast({ variant: "destructive", title: "Webhook inválido", description: webhookError });
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("settings").upsert(
      {
        user_id: user.id,
        webhook_url: webhookUrl || null,
        timezone,
        telegram_bot_token: telegramBotToken || null,
        telegram_chat_id: telegramChatId || null,
      },
      { onConflict: "user_id" },
    );

    if (error) {
      toast({ variant: "destructive", title: "Falha ao salvar", description: error.message });
    } else {
      toast({ title: "Configurações salvas", description: "Webhook e timezone atualizados com sucesso." });
    }
    setSaving(false);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <SectionCard title="Integrações da Luize" description="Webhook do chat e timezone operacional" eyebrow={t("configuracoes.eyebrow.controlSettings")}>
        <form className="space-y-5" onSubmit={handleSave}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Webhook URL</label>
            <Input
              value={webhookUrl}
              onChange={(event) => setWebhookUrl(event.target.value)}
              placeholder="https://seu-n8n/webhook/luize-blond"
              disabled={loading}
              aria-invalid={Boolean(webhookError)}
              className={cn(webhookError && "border-destructive focus-visible:ring-destructive")}
            />
              <p className={cn("text-sm", webhookError ? "text-destructive" : "text-muted-foreground")}>
                {webhookError || "Usado pelo backend do chat para enviar POST ao workflow do n8n com allowlist e timeout."}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Timezone</label>
            <Select value={timezone} onValueChange={setTimezone} disabled={loading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="America/Sao_Paulo">America/Sao_Paulo</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
                <SelectItem value="America/New_York">America/New_York</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Telegram — Bot Token</label>
            <Input
              value={telegramBotToken}
              onChange={(e) => setTelegramBotToken(e.target.value)}
              placeholder="123456:ABCdef... (obtido no BotFather)"
              disabled={loading}
              type="password"
            />
            <p className="text-sm text-muted-foreground">
              Crie um bot no <strong>@BotFather</strong> e cole o token aqui. Luize receberá despesas enviadas por ele.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Telegram — Chat ID</label>
            <Input
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              placeholder="Ex: 123456789 (use @userinfobot para descobrir)"
              disabled={loading}
            />
            <p className="text-sm text-muted-foreground">
              Opcional. Limita as mensagens aceitas ao seu chat. Use <strong>@userinfobot</strong> no Telegram para obter seu ID.
            </p>
          </div>

          {telegramWebhookUrl && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">URL do Webhook Telegram</label>
              <div className="flex items-center gap-2">
                <Input value={telegramWebhookUrl} readOnly className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => { navigator.clipboard.writeText(telegramWebhookUrl); toast({ title: "URL copiada" }); }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Registre esta URL como webhook do seu bot via:<br />
                <code className="rounded bg-muted px-1 text-xs">
                  {"https://api.telegram.org/bot{TOKEN}/setWebhook?url={URL}&secret_token={TOKEN}"}
                </code>
              </p>
            </div>
          )}

          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-panel-elevated p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-1 items-start gap-3">
                <BellOff className="mt-0.5 size-4 text-muted-foreground" />
                <div className="space-y-1">
                  <label htmlFor="realtime-toast-severity" className="text-sm font-medium text-foreground">
                    Severidade dos toasts de realtime no chat
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Escolha quais notificações de conexão você quer receber. O indicador no topo do chat, status, contadores e o histórico continuam ativos independente da escolha.
                  </p>
                </div>
              </div>
              <Select
                value={toastSeverity}
                onValueChange={async (value) => {
                  const next = value as RealtimeToastSeverity;
                  const previous = toastSeverity;
                  setToastSeverity(next);
                  setRealtimeToastSeverity(next);

                  // Record the preference change in the realtime event history so the
                  // user can audit when/why their notification severity changed.
                  if (previous !== next) {
                    const labelOf: Record<RealtimeToastSeverity, string> = {
                      all: "tudo",
                      warnings_and_errors: "avisos e erros",
                      errors_only: "apenas erros",
                      none: "silenciado",
                    };
                    appendRealtimeEvent({
                      status: "settings",
                      reason: `Severidade dos toasts: ${labelOf[previous]} → ${labelOf[next]}`,
                      tabId: getTabId(),
                    });
                  }
                  const labelMap: Record<RealtimeToastSeverity, { title: string; description: string }> = {
                    all: {
                      title: "Mostrando todos os toasts",
                      description: "Você verá conexão, reconexão, avisos e erros do canal realtime.",
                    },
                    warnings_and_errors: {
                      title: "Apenas avisos e erros",
                      description: "Você só verá toasts quando o canal cair (warning) ou falhar (error).",
                    },
                    errors_only: {
                      title: "Apenas erros",
                      description: "Você só receberá toast em caso de falha do canal realtime.",
                    },
                    none: {
                      title: "Toasts de realtime silenciados",
                      description: "Nenhuma notificação de conexão será exibida.",
                    },
                  };
                  toast(labelMap[next]);

                  // Sync the preference to the cloud so it follows the user across devices.
                  if (user) {
                    const result = await pushRealtimeToastSeverityToCloud(user.id, next);
                    if (!result.ok) {
                      sonnerToast.warning("Preferência salva apenas neste dispositivo", {
                        description: "Não foi possível sincronizar com a nuvem agora. Tentaremos de novo na próxima alteração.",
                      });
                    }
                  }
                }}
              >
                <SelectTrigger id="realtime-toast-severity" className="w-full sm:w-64" aria-label="Severidade dos toasts de realtime">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tudo (info, avisos e erros)</SelectItem>
                  <SelectItem value="warnings_and_errors">Avisos e erros</SelectItem>
                  <SelectItem value="errors_only">Apenas erros</SelectItem>
                  <SelectItem value="none">Silenciar tudo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <SeverityMatrix severity={toastSeverity} />
          </div>

          <RealtimeToastSimulator severity={toastSeverity} />

          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-panel-elevated p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-1 items-start gap-3">
              <Bug className="mt-0.5 size-4 text-muted-foreground" />
              <div className="space-y-1">
                <label htmlFor="debug-mode" className="text-sm font-medium text-foreground">
                  Modo debug
                </label>
                <p className="text-sm text-muted-foreground">
                  Mostra um painel flutuante com erros de validação, falhas de RLS e respostas HTTP do Supabase em tempo real — sem precisar abrir o console.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {debugMode ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    pushDebug({
                      level: "info",
                      source: "manual-test",
                      message: "Entrada de teste do modo debug",
                      details: { triggeredAt: new Date().toISOString() },
                    })
                  }
                >
                  Disparar teste
                </Button>
              ) : null}
              <Switch
                id="debug-mode"
                checked={debugMode}
                onCheckedChange={(value) => {
                  setDebugMode(value);
                  setDebugModeEnabled(value);
                  toast({
                    title: value ? "Modo debug ativado" : "Modo debug desativado",
                    description: value
                      ? "Painel flutuante visível no canto inferior direito."
                      : "Painel ocultado.",
                  });
                }}
                aria-label="Ativar modo debug"
              />
            </div>
          </div>

          <Button type="submit" variant="hero" disabled={saving || loading || Boolean(webhookError)}>
            <Save className="size-4" />
            {saving ? "Salvando..." : "Salvar configurações"}
          </Button>
        </form>
      </SectionCard>

      <SectionCard title="Estado atual" description="Leituras rápidas da instância" eyebrow={t("configuracoes.eyebrow.snapshot")}>
        <div className="space-y-4 text-sm text-muted-foreground">
          <div className="rounded-2xl border border-border bg-panel-elevated p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-foreground">
                <Link2 className="size-4 text-accent-blue" />
                Webhook
              </div>
              <Badge variant={webhookUrl ? "success" : "warning"}>{webhookUrl ? "Conectado" : "Pendente"}</Badge>
            </div>
            <p>{webhookUrl || "Nenhuma URL configurada."}</p>
          </div>
          <div className="rounded-2xl border border-border bg-panel-elevated p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-foreground">
                <Send className="size-4 text-accent-blue" />
                Telegram
              </div>
              <Badge variant={telegramBotToken ? "success" : "warning"}>{telegramBotToken ? "Configurado" : "Pendente"}</Badge>
            </div>
            <p>{telegramBotToken ? "Bot ativo — Luize aceita despesas via Telegram." : "Configure o bot token para ativar."}</p>
          </div>
          <div className="rounded-2xl border border-border bg-panel-elevated p-4">
            <div className="mb-2 flex items-center gap-2 text-foreground">
              <BellRing className="size-4 text-primary" />
              Operação
            </div>
            <p>Modo de usuário único ativo para {user?.email}.</p>
          </div>
        </div>
      </SectionCard>

      <div className="xl:col-span-2">
        <TransactionsWebhookCard />
      </div>
    </div>
  );
};

type SimulatedStatus = Extract<PersistedRealtimeStatus, "connecting" | "connected" | "disconnected" | "error">;

const SIMULATED_SEQUENCE: Array<{ status: SimulatedStatus; reason: string }> = [
  { status: "connecting", reason: "Teste manual: tentando conectar" },
  { status: "connected", reason: "Teste manual: canal ativo" },
  { status: "disconnected", reason: "Teste manual: queda simulada" },
  { status: "error", reason: "Teste manual: falha simulada" },
];

const SEVERITY_HINTS: Record<RealtimeToastSeverity, string> = {
  all: "Você deve ver os 4 toasts (info, success, warning, error).",
  warnings_and_errors: "Você deve ver apenas 2 toasts: desconectado (warning) e falha (error).",
  errors_only: "Você deve ver apenas 1 toast: falha (error).",
  none: "Nenhum toast deve aparecer — a categoria está silenciada.",
};

const TRANSITION_ROWS: Array<{
  status: SimulatedStatus;
  label: string;
  toastKind: "info" | "success" | "warning" | "error";
  description: string;
}> = [
  { status: "connecting", label: "Conectando", toastKind: "info", description: "Tentando estabelecer ou retomar o canal" },
  { status: "connected", label: "Reconectado", toastKind: "success", description: "Canal voltou a ficar ativo" },
  { status: "disconnected", label: "Desconectado", toastKind: "warning", description: "Canal caiu de forma inesperada" },
  { status: "error", label: "Falha", toastKind: "error", description: "Erro persistente no canal realtime" },
];

const TOAST_KIND_BADGE: Record<"info" | "success" | "warning" | "error", string> = {
  info: "bg-accent-blue/15 text-accent-blue",
  success: "bg-accent-green/15 text-accent-green",
  warning: "bg-amber-500/15 text-amber-400",
  error: "bg-destructive/15 text-destructive",
};

function SeverityMatrix({ severity }: { severity: RealtimeToastSeverity }) {
  const visibleCount = TRANSITION_ROWS.filter((row) => shouldShowRealtimeToast(severity, row.status)).length;
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          O que aparece com a severidade selecionada
        </p>
        <span className="text-xs text-muted-foreground">
          {visibleCount} de {TRANSITION_ROWS.length} transições
        </span>
      </div>
      <ul className="divide-y divide-border/60">
        {TRANSITION_ROWS.map((row) => {
          const visible = shouldShowRealtimeToast(severity, row.status);
          return (
            <li
              key={row.status}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                {visible ? (
                  <Check className="size-4 shrink-0 text-accent-green" aria-label="Mostrado" />
                ) : (
                  <X className="size-4 shrink-0 text-muted-foreground" aria-label="Oculto" />
                )}
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs font-medium",
                    TOAST_KIND_BADGE[row.toastKind],
                  )}
                >
                  {row.label}
                </span>
                <span className="truncate text-xs text-muted-foreground">{row.description}</span>
              </div>
              <span
                className={cn(
                  "text-xs font-medium",
                  visible ? "text-foreground" : "text-muted-foreground/70 line-through",
                )}
              >
                {visible ? "Mostrado" : "Oculto"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RealtimeToastSimulator({ severity }: { severity: RealtimeToastSeverity }) {
  const [running, setRunning] = useState(false);

  const runSimulation = async () => {
    if (running) return;
    setRunning(true);
    const expected = SIMULATED_SEQUENCE.filter((step) => shouldShowRealtimeToast(severity, step.status));

    sonnerToast.message("Simulação iniciada", {
      description: `Severidade atual: ${severity}. Esperado: ${expected.length} toast${expected.length === 1 ? "" : "s"}.`,
      duration: 2500,
    });

    for (const step of SIMULATED_SEQUENCE) {
      // Honor severity exactly like Chat.tsx does
      if (shouldShowRealtimeToast(severity, step.status)) {
        const time = new Date().toLocaleTimeString("pt-BR");
        const description = `${step.reason} · simulado às ${time}`;
        if (step.status === "connected") sonnerToast.success("Realtime reconectado", { description });
        else if (step.status === "disconnected") sonnerToast.warning("Realtime desconectado", { description });
        else if (step.status === "error") sonnerToast.error("Falha no realtime", { description });
        else sonnerToast.info("Conectando ao realtime", { description, duration: 2500 });
      }
      await new Promise((resolve) => setTimeout(resolve, 700));
    }

    setRunning(false);
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border bg-panel-elevated p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-1 items-start gap-3">
        <Radio className="mt-0.5 size-4 text-accent-blue" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Testar toasts de realtime</p>
          <p className="text-sm text-muted-foreground">
            Dispara um connecting → connected → disconnected → error simulado. Apenas os toasts permitidos pela severidade
            atual aparecerão. {SEVERITY_HINTS[severity]}
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={runSimulation}
        disabled={running}
        aria-label="Disparar simulação de toasts de realtime"
      >
        <Radio className="size-4" />
        {running ? "Simulando..." : "Disparar teste"}
      </Button>
    </div>
  );
}

export default Configuracoes;
