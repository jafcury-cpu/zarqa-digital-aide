import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Plus, Trash2, Tags } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SectionCard } from "@/components/luize/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const INTERNAL_CATEGORIES = [
  "Moradia",
  "Saúde",
  "Transporte",
  "Educação",
  "Lazer",
  "Alimentação",
  "Receitas",
  "Outros",
] as const;

type Mapping = {
  id: string;
  external_category: string;
  internal_category: string;
};

const SUGGESTIONS: Array<[string, string]> = [
  ["Supermercado", "Alimentação"],
  ["Restaurante", "Alimentação"],
  ["groceries", "Alimentação"],
  ["Uber", "Transporte"],
  ["Combustível", "Transporte"],
  ["Farmácia", "Saúde"],
  ["Aluguel", "Moradia"],
  ["Streaming", "Lazer"],
  ["Salário", "Receitas"],
];

export function CategoryMappingsCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newExternal, setNewExternal] = useState("");
  const [newInternal, setNewInternal] = useState<string>("Outros");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("category_mappings")
      .select("id, external_category, internal_category")
      .eq("user_id", user.id)
      .order("external_category", { ascending: true });
    if (error) {
      toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    } else {
      setMappings((data ?? []) as Mapping[]);
    }
    setLoading(false);
  }, [user, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const addMapping = async (external: string, internal: string) => {
    if (!user) return;
    const ext = external.trim();
    if (!ext) {
      toast({ title: "Informe a categoria externa", variant: "destructive" });
      return;
    }
    if (!INTERNAL_CATEGORIES.includes(internal as typeof INTERNAL_CATEGORIES[number])) {
      toast({ title: "Categoria interna inválida", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("category_mappings").upsert(
      { user_id: user.id, external_category: ext, internal_category: internal },
      { onConflict: "user_id,external_category" },
    );
    setSaving(false);
    if (error) {
      // Caso o índice unique seja em lower(), o upsert pode falhar — tentamos update manual.
      if (error.code === "23505" || error.message?.includes("duplicate")) {
        const existing = mappings.find(
          (m) => m.external_category.toLowerCase() === ext.toLowerCase(),
        );
        if (existing) {
          const { error: updErr } = await supabase
            .from("category_mappings")
            .update({ internal_category: internal })
            .eq("id", existing.id);
          if (updErr) {
            toast({ title: "Erro ao atualizar", description: updErr.message, variant: "destructive" });
            return;
          }
        }
      } else {
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        return;
      }
    }
    setNewExternal("");
    setNewInternal("Outros");
    toast({ title: "Mapeamento salvo" });
    void load();
  };

  const updateInternal = async (id: string, internal: string) => {
    const { error } = await supabase
      .from("category_mappings")
      .update({ internal_category: internal })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    } else {
      setMappings((prev) =>
        prev.map((m) => (m.id === id ? { ...m, internal_category: internal } : m)),
      );
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("category_mappings").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    } else {
      setMappings((prev) => prev.filter((m) => m.id !== id));
    }
  };

  const seedSuggestions = async () => {
    if (!user) return;
    const existing = new Set(mappings.map((m) => m.external_category.toLowerCase()));
    const toInsert = SUGGESTIONS.filter(([ext]) => !existing.has(ext.toLowerCase())).map(
      ([external_category, internal_category]) => ({
        user_id: user.id,
        external_category,
        internal_category,
      }),
    );
    if (toInsert.length === 0) {
      toast({ title: "Sugestões já estão na sua lista" });
      return;
    }
    const { error } = await supabase.from("category_mappings").insert(toInsert);
    if (error) {
      toast({ title: "Erro ao adicionar sugestões", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${toInsert.length} sugestões adicionadas` });
      void load();
    }
  };

  return (
    <SectionCard
      title="Mapeamento de Categorias"
      description="Traduza categorias externas (Tesouro Brilhante, n8n, OFX) para as categorias internas da Luize antes da inserção."
      eyebrow="Webhook · normalização"
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
          <Tags className="mr-1.5 inline size-3.5" />
          Toda transação recebida pelo webhook passa por este mapa antes de ser salva. Se a
          categoria externa não estiver listada nem corresponder a uma categoria interna válida,
          ela vira <Badge variant="secondary">Outros</Badge> e aparece em{" "}
          <code className="rounded bg-muted px-1">unmapped_categories</code> na resposta.
        </div>

        {/* Adicionar novo */}
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto]">
          <Input
            placeholder='Ex.: "Supermercado" ou "groceries"'
            value={newExternal}
            onChange={(e) => setNewExternal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addMapping(newExternal, newInternal);
            }}
          />
          <div className="hidden items-center justify-center text-muted-foreground sm:flex">
            <ArrowRight className="size-4" />
          </div>
          <Select value={newInternal} onValueChange={setNewInternal}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERNAL_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            onClick={() => void addMapping(newExternal, newInternal)}
            disabled={saving || !newExternal.trim()}
          >
            <Plus className="mr-1.5 size-4" /> Adicionar
          </Button>
        </div>

        {/* Lista */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : mappings.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-6">
            <p className="text-sm text-muted-foreground">
              Nenhum mapeamento ainda. Quer começar com um conjunto de sugestões padrão?
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void seedSuggestions()}>
              <Plus className="mr-1.5 size-4" /> Adicionar sugestões
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {mappings.map((m) => (
              <div
                key={m.id}
                className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 p-3"
              >
                <span className="truncate font-mono text-sm" title={m.external_category}>
                  {m.external_category}
                </span>
                <ArrowRight className="size-4 text-muted-foreground" />
                <Select
                  value={m.internal_category}
                  onValueChange={(v) => void updateInternal(m.id, v)}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERNAL_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => void remove(m.id)}
                  title="Remover"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
