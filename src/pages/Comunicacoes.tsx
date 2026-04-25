import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Filter, Inbox, Loader2, MessageSquare, MoreHorizontal, Send, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { SectionCard } from "@/components/luize/section-card";
import { useDocumentTitle } from "@/hooks/use-document-title";

type Channel = "whatsapp" | "email" | "instagram" | "linkedin" | "facebook";
type MsgStatus = "pending" | "replied" | "archived";

interface CommMessage {
  id: string;
  channel: Channel;
  sender_name: string;
  sender_handle: string | null;
  subject: string | null;
  content: string;
  status: MsgStatus;
  priority: string;
  received_at: string;
}

interface CommReply {
  id: string;
  message_id: string;
  ai_suggestion: string;
  approved_content: string | null;
  status: string;
}

const channelConfig: Record<Channel, { label: string; color: string; icon: string }> = {
  whatsapp: { label: "WhatsApp", color: "bg-green-600", icon: "💬" },
  email: { label: "E-mail", color: "bg-blue-600", icon: "📧" },
  instagram: { label: "Instagram", color: "bg-pink-600", icon: "📸" },
  linkedin: { label: "LinkedIn", color: "bg-sky-700", icon: "💼" },
  facebook: { label: "Facebook", color: "bg-indigo-600", icon: "👤" },
};

const Comunicacoes = () => {
  useDocumentTitle("Comunicações");
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<CommMessage[]>([]);
  const [replies, setReplies] = useState<CommReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedMsg, setSelectedMsg] = useState<CommMessage | null>(null);
  const [suggestingId, setSuggestingId] = useState<string | null>(null);
  const [editedReply, setEditedReply] = useState<string>("");
  const [sendingId, setSendingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: msgs }, { data: reps }] = await Promise.all([
        supabase.from("communication_messages").select("*").order("received_at", { ascending: false }),
        supabase.from("communication_replies").select("*").order("created_at", { ascending: false }),
      ]);
      setMessages((msgs as CommMessage[]) || []);
      setReplies((reps as CommReply[]) || []);
    } catch (e) {
      console.error("Erro ao carregar comunicações:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() =>
    messages.filter(m =>
      (channelFilter === "all" || m.channel === channelFilter) &&
      (statusFilter === "all" || m.status === statusFilter)
    ), [messages, channelFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: messages.length,
    pending: messages.filter(m => m.status === "pending").length,
    replied: messages.filter(m => m.status === "replied").length,
    channels: [...new Set(messages.map(m => m.channel))].length,
  }), [messages]);

  const handleSuggestReply = async (msg: CommMessage) => {
    setSuggestingId(msg.id);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-reply", {
        body: { message_id: msg.id },
      });
      if (error) throw error;
      if (data?.reply) {
        setReplies(prev => [data.reply, ...prev]);
        setEditedReply(data.reply.ai_suggestion);
        toast({ title: "Sugestão gerada", description: "Revise e aprove antes de enviar." });
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao gerar sugestão", description: e.message });
    } finally {
      setSuggestingId(null);
    }
  };

  const handleApproveReply = async (reply: CommReply) => {
    setSendingId(reply.id);
    try {
      // Update reply status
      await supabase.from("communication_replies").update({
        approved_content: editedReply || reply.ai_suggestion,
        status: "approved",
      }).eq("id", reply.id);

      // Update message status
      await supabase.from("communication_messages").update({ status: "replied" }).eq("id", reply.message_id);

      // TODO: conectar com n8n webhook para envio real da resposta
      toast({ title: "Resposta aprovada", description: "Aguardando envio pelo n8n." });
      fetchData();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro", description: e.message });
    } finally {
      setSendingId(null);
    }
  };

  const handleArchive = async (msgId: string) => {
    await supabase.from("communication_messages").update({ status: "archived" }).eq("id", msgId);
    toast({ title: "Mensagem arquivada" });
    fetchData();
    if (selectedMsg?.id === msgId) setSelectedMsg(null);
  };

  const msgReply = selectedMsg ? replies.find(r => r.message_id === selectedMsg.id && r.status === "suggested") : null;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total", value: stats.total, icon: Inbox },
          { label: "Pendentes", value: stats.pending, icon: MessageSquare },
          { label: "Respondidas", value: stats.replied, icon: Check },
          { label: "Canais ativos", value: stats.channels, icon: Filter },
        ].map(s => (
          <Card key={s.label} className="surface-panel border-border/60">
            <CardContent className="flex items-center gap-3 p-4">
              <s.icon className="size-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-40 border-border bg-panel">
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os canais</SelectItem>
            {Object.entries(channelConfig).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 border-border bg-panel">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="replied">Respondidas</SelectItem>
            <SelectItem value="archived">Arquivadas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* Message list */}
        <SectionCard title="Mensagens" description={`${filtered.length} mensagem(ns)`}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <Inbox className="mx-auto mb-3 size-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Nenhuma mensagem encontrada.</p>
              <p className="mt-1 text-xs text-muted-foreground">As mensagens chegam via webhook do n8n.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(msg => {
                const ch = channelConfig[msg.channel] || channelConfig.whatsapp;
                const isSelected = selectedMsg?.id === msg.id;
                return (
                  <button
                    key={msg.id}
                    onClick={() => { setSelectedMsg(msg); setEditedReply(""); }}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      isSelected ? "border-primary/60 bg-primary/10" : "border-border/40 bg-panel hover:bg-panel-elevated"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{ch.icon}</span>
                        <div>
                          <p className="text-sm font-medium text-foreground">{msg.sender_name}</p>
                          <p className="text-xs text-muted-foreground">{ch.label}{msg.sender_handle ? ` · ${msg.sender_handle}` : ""}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={msg.status === "pending" ? "destructive" : msg.status === "replied" ? "default" : "secondary"} className="text-[10px]">
                          {msg.status === "pending" ? "Pendente" : msg.status === "replied" ? "Respondida" : "Arquivada"}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <span className="cursor-pointer text-muted-foreground hover:text-foreground"><MoreHorizontal className="size-4" /></span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleArchive(msg.id); }}>Arquivar</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    {msg.subject && <p className="mt-1 text-xs font-medium text-foreground/80">{msg.subject}</p>}
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{msg.content}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground/60">
                      {new Date(msg.received_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* Detail / reply panel */}
        <SectionCard title="Secretária IA" description="Sugerir e aprovar respostas">
          {!selectedMsg ? (
            <div className="py-16 text-center">
              <Sparkles className="mx-auto mb-3 size-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Selecione uma mensagem para gerar uma sugestão de resposta pela IA.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Original message */}
              <Card className="border-border/50 bg-muted/30">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <span className="text-base">{channelConfig[selectedMsg.channel]?.icon}</span>
                    {selectedMsg.sender_name}
                  </CardDescription>
                  {selectedMsg.subject && <CardTitle className="text-sm">{selectedMsg.subject}</CardTitle>}
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm text-foreground/90">{selectedMsg.content}</p>
                </CardContent>
              </Card>

              {/* AI suggestion */}
              {msgReply ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">Sugestão da IA</span>
                  </div>
                  <Textarea
                    value={editedReply || msgReply.ai_suggestion}
                    onChange={(e) => setEditedReply(e.target.value)}
                    className="min-h-[120px] border-border bg-panel text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApproveReply(msgReply)}
                      disabled={sendingId === msgReply.id}
                    >
                      {sendingId === msgReply.id ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Send className="mr-1 size-3" />}
                      Aprovar e enviar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        supabase.from("communication_replies").update({ status: "rejected" }).eq("id", msgReply.id).then(() => fetchData());
                      }}
                    >
                      <X className="mr-1 size-3" /> Rejeitar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  className="w-full"
                  onClick={() => handleSuggestReply(selectedMsg)}
                  disabled={suggestingId === selectedMsg.id || selectedMsg.status === "archived"}
                >
                  {suggestingId === selectedMsg.id ? (
                    <><Loader2 className="mr-2 size-4 animate-spin" /> Gerando sugestão...</>
                  ) : (
                    <><Sparkles className="mr-2 size-4" /> Gerar resposta com IA</>
                  )}
                </Button>
              )}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
};

export default Comunicacoes;
