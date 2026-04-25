import { t } from "@/lib/i18n";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronUp, Download, RefreshCw, SendHorizontal, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { SectionCard } from "@/components/luize/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/luize-mocks";

const PAGE_SIZE = 200;

type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

function isValidMessageRole(role: string): role is MessageRow["role"] {
  return role === "user" || role === "assistant";
}

const fallbackWelcome: MessageRow = {
  id: "welcome",
  role: "assistant",
  content: "Pronta para organizar sua operação. Pergunte sobre agenda, finanças, saúde ou documentos.",
  created_at: new Date().toISOString(),
};

function sanitizeMessages(rows: Array<{ id: string; role: string; content: string; created_at: string }> | null | undefined) {
  return (rows ?? []).filter((row): row is MessageRow => isValidMessageRole(row.role));
}

function getFriendlyWebhookError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message.toLowerCase() : "";

  if (
    rawMessage.includes("timeouterror") ||
    rawMessage.includes("504") ||
    rawMessage.includes("timeout")
  ) {
    return "O webhook demorou demais para responder. Tente novamente em instantes.";
  }

  if (
    rawMessage.includes("allowlist") ||
    rawMessage.includes("domínio do webhook não está na allowlist") ||
    rawMessage.includes("domínio do webhook não é permitido")
  ) {
    return "O domínio configurado para o webhook está bloqueado por segurança. Revise a URL em Configurações.";
  }

  if (
    rawMessage.includes("failed to fetch") ||
    rawMessage.includes("network") ||
    rawMessage.includes("non-2xx") ||
    rawMessage.includes("webhook retornou") ||
    rawMessage.includes("falha ao acionar o backend do chat")
  ) {
    return "O webhook está indisponível no momento. Verifique se ele está online e tente novamente.";
  }

  return error instanceof Error ? error.message : "A resposta não pôde ser concluída.";
}

type WebhookStatus = "idle" | "checking" | "online" | "offline" | "timeout" | "not_configured" | "invalid";

const STATUS_BADGE: Record<WebhookStatus, { variant: "success" | "warning" | "destructive" | "secondary"; label: string }> = {
  idle: { variant: "secondary", label: "Aguardando verificação" },
  checking: { variant: "secondary", label: "Verificando conexão..." },
  online: { variant: "success", label: "Webhook online" },
  offline: { variant: "destructive", label: "Webhook offline" },
  timeout: { variant: "destructive", label: "Webhook sem resposta" },
  not_configured: { variant: "warning", label: "Webhook não configurado" },
  invalid: { variant: "destructive", label: "Webhook inválido" },
};

const Chat = () => {
  useDocumentTitle("Chat");
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<WebhookStatus>("idle");
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const previousScrollHeightRef = useRef<number>(0);

  const checkWebhook = useCallback(async () => {
    setStatus("checking");
    setStatusDetail(null);
    try {
      const { data, error } = await supabase.functions.invoke("chat-webhook", {
        body: { mode: "ping" },
      });
      if (error) {
        setStatus("offline");
        setStatusDetail(getFriendlyWebhookError(error));
        setLatencyMs(null);
        return;
      }
      const next = (data?.status as WebhookStatus | undefined) ?? "offline";
      setStatus(next);
      setStatusDetail(typeof data?.message === "string" ? data.message : null);
      setLatencyMs(typeof data?.latencyMs === "number" ? data.latencyMs : null);
    } catch (error) {
      setStatus("offline");
      setStatusDetail(getFriendlyWebhookError(error));
      setLatencyMs(null);
    } finally {
      setLastCheckedAt(new Date());
    }
  }, []);

  // Initial load: latest PAGE_SIZE messages + settings
  useEffect(() => {
    if (!user) return;

    const load = async () => {
      setLoading(true);

      const [{ data: messageRows, error: messagesError }, { data: settingsRow, error: settingsError }] = await Promise.all([
        supabase
          .from("messages")
          .select("id, role, content, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(PAGE_SIZE + 1),
        supabase.from("settings").select("webhook_url").eq("user_id", user.id).maybeSingle(),
      ]);

      if (messagesError) {
        toast({ variant: "destructive", title: "Falha ao carregar chat", description: messagesError.message });
      } else {
        const rows = (messageRows ?? []) as Array<{ id: string; role: string; content: string; created_at: string }>;
        const more = rows.length > PAGE_SIZE;
        const slice = more ? rows.slice(0, PAGE_SIZE) : rows;
        setMessages(sanitizeMessages(slice.reverse()));
        setHasMore(more);
      }

      const url = !settingsError ? settingsRow?.webhook_url ?? null : null;
      setWebhookUrl(url);
      setLoading(false);

      if (url) {
        void checkWebhook();
      } else {
        setStatus("not_configured");
        setLastCheckedAt(new Date());
      }
    };

    void load();
  }, [toast, user, checkWebhook]);

  // Realtime: keep history in sync across tabs/devices for the current user
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`messages:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as { id: string; role: string; content: string; created_at: string };
          if (!isValidMessageRole(row.role)) return;
          const role: MessageRow["role"] = row.role;
          setMessages((current) => {
            if (current.some((m) => m.id === row.id)) return current;
            const next: MessageRow = { id: row.id, role, content: row.content, created_at: row.created_at };
            return [...current, next];
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const oldRow = payload.old as { id?: string };
          if (oldRow?.id) {
            setMessages((current) => current.filter((m) => m.id !== oldRow.id));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);

  // Auto-scroll to bottom on new messages (skip when user just loaded older ones)
  useEffect(() => {
    if (loadingMore) return;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, loadingMore]);

  // Preserve scroll position when prepending older messages
  useEffect(() => {
    if (!loadingMore || !scrollRef.current) return;
    const container = scrollRef.current;
    container.scrollTop = container.scrollHeight - previousScrollHeightRef.current;
  }, [messages, loadingMore]);

  const loadOlder = useCallback(async () => {
    if (!user || !hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    if (scrollRef.current) {
      previousScrollHeightRef.current = scrollRef.current.scrollHeight;
    }
    const oldest = messages[0];
    const { data, error } = await supabase
      .from("messages")
      .select("id, role, content, created_at")
      .eq("user_id", user.id)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (error) {
      toast({ variant: "destructive", title: "Falha ao carregar histórico", description: error.message });
      setLoadingMore(false);
      return;
    }
    const rows = (data ?? []) as Array<{ id: string; role: string; content: string; created_at: string }>;
    const more = rows.length > PAGE_SIZE;
    const slice = (more ? rows.slice(0, PAGE_SIZE) : rows).reverse();
    setMessages((current) => [...sanitizeMessages(slice), ...current]);
    setHasMore(more);
    setLoadingMore(false);
  }, [user, hasMore, loadingMore, messages, toast]);

  const handleClearHistory = useCallback(async () => {
    if (!user || clearing) return;
    setClearing(true);
    const { error } = await supabase.from("messages").delete().eq("user_id", user.id);
    if (error) {
      toast({ variant: "destructive", title: "Falha ao limpar histórico", description: error.message });
    } else {
      setMessages([]);
      setHasMore(false);
      toast({ title: "Histórico limpo", description: "Todas as mensagens foram removidas." });
    }
    setClearing(false);
    setConfirmClearOpen(false);
  }, [user, clearing, toast]);

  const handleExport = useCallback(async () => {
    if (!user || exporting) return;
    setExporting(true);
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("id, role, content, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const payload = {
        exported_at: new Date().toISOString(),
        user_id: user.id,
        count: data?.length ?? 0,
        messages: data ?? [],
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `luize-chat-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: "Histórico exportado", description: `${payload.count} mensagens baixadas.` });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Falha ao exportar",
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setExporting(false);
    }
  }, [user, exporting, toast]);

  const renderedMessages = useMemo(() => (messages.length ? messages : [fallbackWelcome]), [messages]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !input.trim() || sending) return;

    const content = input.trim();
    setSending(true);
    setInput("");

    const { data: userMessage, error: userInsertError } = await supabase
      .from("messages")
      .insert({ user_id: user.id, role: "user", content })
      .select("id, role, content, created_at")
      .single();

    if (userInsertError || !userMessage) {
      toast({ variant: "destructive", title: "Falha ao enviar", description: userInsertError?.message ?? "Tente novamente." });
      setInput(content);
      setSending(false);
      return;
    }

    setMessages((current) => [...current, userMessage as MessageRow]);

    try {
      let reply = "Webhook ainda não configurado. Defina a URL em Configurações para ativar respostas do n8n.";

      if (webhookUrl) {
        const history = [...messages, userMessage as MessageRow].map((message) => ({ role: message.role, content: message.content }));
        const { data, error } = await supabase.functions.invoke("chat-webhook", {
          body: {
            message: content,
            source: "luize-chat",
            history,
          },
        });

        if (error) {
          throw new Error(error.message || "Falha ao acionar o backend do chat.");
        }

        reply = typeof data?.reply === "string" ? data.reply.trim() || reply : reply;
      }

      const { data: assistantMessage, error: assistantInsertError } = await supabase
        .from("messages")
        .insert({ user_id: user.id, role: "assistant", content: reply })
        .select("id, role, content, created_at")
        .single();

      if (assistantInsertError || !assistantMessage) {
        throw assistantInsertError ?? new Error("Resposta sem persistência");
      }

      setMessages((current) => [...current, assistantMessage as MessageRow]);
      if (webhookUrl && status !== "online") {
        setStatus("online");
        setStatusDetail(null);
        setLastCheckedAt(new Date());
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro no webhook",
        description: getFriendlyWebhookError(error),
      });
      // Re-check status so the indicator reflects reality after a failure
      if (webhookUrl) void checkWebhook();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.6fr_0.7fr]">
      <SectionCard
        title="Canal direto com a Luize"
        description="Interface de chat persistida no banco e pronta para webhook externo"
        eyebrow={t("chat.eyebrow.messaging")}
        className="min-h-[72vh]"
        contentClassName="flex h-full flex-col"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_BADGE[status].variant}>{STATUS_BADGE[status].label}</Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { void checkWebhook(); }}
              disabled={status === "checking" || !webhookUrl}
              className="h-8 gap-1.5"
              aria-label="Re-testar conexão com o webhook"
            >
              <RefreshCw className={`size-3.5 ${status === "checking" ? "animate-spin" : ""}`} />
              Testar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { void handleExport(); }}
              disabled={exporting || loading || messages.length === 0}
              className="h-8 gap-1.5"
              aria-label="Exportar histórico em JSON"
            >
              <Download className="size-3.5" />
              {exporting ? "Exportando..." : "Exportar"}
            </Button>
            <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={clearing || loading || messages.length === 0}
                  className="h-8 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Limpar histórico do chat"
                >
                  <Trash2 className="size-3.5" />
                  Limpar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Limpar todo o histórico?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação remove permanentemente todas as mensagens deste usuário no banco. Não há como desfazer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={clearing}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(event) => {
                      event.preventDefault();
                      void handleClearHistory();
                    }}
                    disabled={clearing}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {clearing ? "Limpando..." : "Sim, limpar tudo"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        }
      >
        <div className="flex min-h-[60vh] flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-panel-elevated">
          <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4 md:p-5">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="max-w-[80%] rounded-2xl border border-border bg-panel px-4 py-3">
                  <div className="h-4 animate-pulse rounded bg-muted" />
                </div>
              ))
            ) : (
              <>
                {renderedMessages.map((message) => {
                  const isUser = message.role === "user";
                  return (
                    <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-[1.4rem] border px-4 py-3 md:max-w-[70%] ${
                          isUser
                            ? "border-secondary/30 bg-secondary/20 text-foreground"
                            : "border-border bg-panel text-foreground"
                        }`}
                      >
                        <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>
                        <p className="mt-2 text-right font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          {formatDateTime(message.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {sending ? (
                  <div className="flex justify-start">
                    <div className="rounded-[1.4rem] border border-border bg-panel px-4 py-3">
                      <p className="text-sm text-muted-foreground">digitando...</p>
                    </div>
                  </div>
                ) : null}
              </>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={handleSubmit} className="border-t border-border bg-panel/80 p-4">
            <div className="flex items-end gap-3">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Escreva um comando, pergunta ou pedido..."
                className="min-h-[60px] resize-none border-border bg-background"
              />
              <Button type="submit" variant="hero" size="icon" className="h-[60px] w-[60px] rounded-2xl" disabled={sending || !input.trim()}>
                <SendHorizontal className="size-5" />
              </Button>
            </div>
          </form>
        </div>
      </SectionCard>

      <SectionCard title="Roteamento" description="Destino atual das mensagens" eyebrow={t("chat.eyebrow.deliveryNotes")}>
        <div className="space-y-4 text-sm text-muted-foreground">
          <div className="rounded-xl border border-border bg-panel-elevated p-4">
            <p className="mb-2 text-kicker">Persistência</p>
            <p>
              Toda mensagem é gravada na tabela <span className="font-mono text-foreground">messages</span>.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-panel-elevated p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-kicker">Status da conexão</p>
              <Badge variant={STATUS_BADGE[status].variant}>{STATUS_BADGE[status].label}</Badge>
            </div>
            {statusDetail ? <p className="mb-2 text-foreground">{statusDetail}</p> : null}
            {latencyMs !== null && status === "online" ? (
              <p className="mb-2 font-mono text-xs text-muted-foreground">Latência: {latencyMs} ms</p>
            ) : null}
            {lastCheckedAt ? (
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Verificado às {lastCheckedAt.toLocaleTimeString("pt-BR")}
              </p>
            ) : null}
            {status === "not_configured" ? (
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link to="/configuracoes">Configurar webhook</Link>
              </Button>
            ) : null}
          </div>
          <div className="rounded-xl border border-border bg-panel-elevated p-4">
            <p className="mb-2 text-kicker">Webhook</p>
            <p className="break-all">{webhookUrl || "Nenhuma URL configurada no momento."}</p>
          </div>
          <div className="rounded-xl border border-border bg-panel-elevated p-4">
            <p className="mb-2 text-kicker">Payload</p>
             <p className="leading-6">Mensagem atual, userId e histórico validado com papéis permitidos são enviados em POST JSON para o n8n.</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
};

export default Chat;
