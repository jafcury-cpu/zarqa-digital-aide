import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { SectionCard } from "@/components/luize/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/luize-mocks";

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

const Chat = () => {
  useDocumentTitle("Chat");
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      setLoading(true);

      const [{ data: messageRows, error: messagesError }, { data: settingsRow, error: settingsError }] = await Promise.all([
        supabase.from("messages").select("id, role, content, created_at").eq("user_id", user.id).order("created_at", { ascending: true }),
        supabase.from("settings").select("webhook_url").eq("user_id", user.id).maybeSingle(),
      ]);

      if (messagesError) {
        toast({ variant: "destructive", title: "Falha ao carregar chat", description: messagesError.message });
      } else {
        setMessages(sanitizeMessages(messageRows as Array<{ id: string; role: string; content: string; created_at: string }> | null | undefined));
      }

      if (!settingsError) {
        setWebhookUrl(settingsRow?.webhook_url ?? null);
      }

      setLoading(false);
    };

    void load();
  }, [toast, user]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

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
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro no webhook",
        description: getFriendlyWebhookError(error),
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.6fr_0.7fr]">
      <SectionCard
        title="Canal direto com a Luize"
        description="Interface de chat persistida no banco e pronta para webhook externo"
        eyebrow="Mensagens"
        className="min-h-[72vh]"
        contentClassName="flex h-full flex-col"
        action={<Badge variant={webhookUrl ? "success" : "warning"}>{webhookUrl ? "Webhook ativo" : "Webhook pendente"}</Badge>}
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

      <SectionCard title="Roteamento" description="Destino atual das mensagens" eyebrow="Notas de entrega">
        <div className="space-y-4 text-sm text-muted-foreground">
          <div className="rounded-xl border border-border bg-panel-elevated p-4">
            <p className="mb-2 text-kicker">Persistência</p>
            <p>
              Toda mensagem é gravada na tabela <span className="font-mono text-foreground">messages</span>.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-panel-elevated p-4">
            <p className="mb-2 text-kicker">Webhook</p>
            <p>{webhookUrl || "Nenhuma URL configurada no momento."}</p>
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
