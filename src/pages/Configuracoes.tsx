import { FormEvent, useEffect, useState } from "react";
import { BellRing, Link2, Save } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { SectionCard } from "@/components/zarqa/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const Configuracoes = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;

    const loadSettings = async () => {
      setLoading(true);
      const { data, error } = await supabase.from("settings").select("webhook_url, timezone").eq("user_id", user.id).maybeSingle();
      if (error) {
        toast({ variant: "destructive", title: "Falha ao carregar configurações", description: error.message });
      } else if (data) {
        setWebhookUrl(data.webhook_url ?? "");
        setTimezone(data.timezone ?? "America/Sao_Paulo");
      }
      setLoading(false);
    };

    void loadSettings();
  }, [toast, user]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;

    setSaving(true);
    const { error } = await supabase.from("settings").upsert(
      {
        user_id: user.id,
        webhook_url: webhookUrl || null,
        timezone,
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
      <SectionCard title="Integrações da ZARQA" description="Webhook do chat e timezone operacional" eyebrow="Control settings">
        <form className="space-y-5" onSubmit={handleSave}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Webhook URL</label>
            <Input
              value={webhookUrl}
              onChange={(event) => setWebhookUrl(event.target.value)}
              placeholder="https://seu-n8n/webhook/zarqa"
              disabled={loading}
            />
            <p className="text-sm text-muted-foreground">Usado pelo chat para enviar POST ao workflow do n8n.</p>
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

          <Button type="submit" variant="hero" disabled={saving}>
            <Save className="size-4" />
            {saving ? "Salvando..." : "Salvar configurações"}
          </Button>
        </form>
      </SectionCard>

      <SectionCard title="Estado atual" description="Leituras rápidas da instância" eyebrow="Snapshot">
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
            <div className="mb-2 flex items-center gap-2 text-foreground">
              <BellRing className="size-4 text-primary" />
              Operação
            </div>
            <p>Modo single-user ativo para {user?.email}.</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
};

export default Configuracoes;
