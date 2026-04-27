import { t } from "@/lib/i18n";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { BellRing, Copy, Link2, Save, Send, BellOff, Radio } from "lucide-react";
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
  CHAT_PREFS_CHANGED_EVENT,
  getRealtimeToastSeverity,
  REALTIME_TOAST_SEVERITY_KEY,
  setRealtimeToastSeverity,
  shouldShowRealtimeToast,
  type RealtimeToastSeverity,
  type PersistedRealtimeStatus,
} from "@/lib/chat-preferences";

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
      const { data, error } = await supabase.from("settings").select("webhook_url, timezone, telegram_bot_token, telegram_chat_id").eq("user_id", user.id).maybeSingle();
      if (error) {
        toast({ variant: "destructive", title: "Falha ao carregar configurações", description: error.message });
      } else if (data) {
        setWebhookUrl(data.webhook_url ?? "");
        setTimezone(data.timezone ?? "America/Sao_Paulo");
        setTelegramBotToken(data.telegram_bot_token ?? "");
        setTelegramChatId(data.telegram_chat_id ?? "");
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

          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-panel-elevated p-4 sm:flex-row sm:items-start sm:justify-between">
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
              onValueChange={(value) => {
                const next = value as RealtimeToastSeverity;
                setToastSeverity(next);
                setRealtimeToastSeverity(next);
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
    </div>
  );
};

export default Configuracoes;
