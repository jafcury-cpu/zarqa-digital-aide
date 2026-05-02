import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, ScanSearch, Sparkles, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ReconciliationFormDialog } from "@/components/luize/reconciliation-form-dialog";

export type ReconciliationRow = {
  id: string;
  institution: string;
  progress_pct: number;
  current_phase: string;
  note: string | null;
};

type Phase = "manual" | "semi-auto" | "auto";

const PHASE_LABEL: Record<Phase, string> = {
  manual: "Manual",
  "semi-auto": "Semi-automático",
  auto: "Open Finance",
};

const PHASE_ORDER: Phase[] = ["manual", "semi-auto", "auto"];

const PHASE_DESCRIPTION: Record<Phase, string> = {
  manual: "Cole extrato e categorize manualmente.",
  "semi-auto": "Importação OFX/CSV com validação assistida.",
  auto: "Conexão Open Finance — atualização contínua.",
};

function normalizePhase(value: string): Phase {
  if (value === "auto" || value === "semi-auto") return value;
  return "manual";
}

function nextPhase(current: Phase): Phase | null {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx < 0 || idx === PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}

function statusVariant(pct: number) {
  if (pct >= 90) return "text-success";
  if (pct >= 60) return "text-warning";
  return "text-destructive";
}

export function ReconciliationOverview({
  rows,
  onChanged,
}: {
  rows: ReconciliationRow[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [advancingId, setAdvancingId] = useState<string | null>(null);

  const totals = useMemo(() => {
    if (!rows.length) {
      return { avg: 0, byPhase: { manual: 0, "semi-auto": 0, auto: 0 } as Record<Phase, number>, count: 0 };
    }
    const sum = rows.reduce((s, r) => s + r.progress_pct, 0);
    const byPhase: Record<Phase, number> = { manual: 0, "semi-auto": 0, auto: 0 };
    rows.forEach((r) => {
      byPhase[normalizePhase(r.current_phase)]++;
    });
    return { avg: Math.round(sum / rows.length), byPhase, count: rows.length };
  }, [rows]);

  const handleAdvance = async (row: ReconciliationRow) => {
    const next = nextPhase(normalizePhase(row.current_phase));
    if (!next) return;
    setAdvancingId(row.id);
    try {
      const { error } = await supabase
        .from("reconciliation_status")
        .update({ current_phase: next })
        .eq("id", row.id);
      if (error) throw error;
      toast({ title: `${row.institution} avançou para ${PHASE_LABEL[next]}` });
      onChanged();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível avançar a fase",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setAdvancingId(null);
    }
  };

  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-border bg-panel-elevated p-6 text-center">
        <ScanSearch className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          Nenhuma instituição em conciliação. Adicione uma para começar a acompanhar o progresso.
        </p>
        <div className="mt-4 flex justify-center">
          <ReconciliationFormDialog onSaved={onChanged} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header KPI + ação */}
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <div className="rounded-2xl border border-border bg-panel-elevated p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Progresso médio</p>
              <p className={`mt-1 font-display text-4xl ${statusVariant(totals.avg)}`}>{totals.avg}%</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {totals.count} {totals.count === 1 ? "instituição" : "instituições"} acompanhadas
              </p>
            </div>
            <div className="flex gap-2">
              {PHASE_ORDER.map((p) => (
                <div key={p} className="rounded-xl border border-border bg-panel px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{PHASE_LABEL[p]}</p>
                  <p className="mt-1 font-display text-xl text-foreground">{totals.byPhase[p]}</p>
                </div>
              ))}
            </div>
          </div>
          <Progress value={totals.avg} className="mt-4 h-2 bg-muted" />
        </div>
        <div className="flex md:flex-col md:items-stretch md:gap-2">
          <ReconciliationFormDialog onSaved={onChanged} />
        </div>
      </div>

      {/* Stepper visão geral */}
      <div className="rounded-2xl border border-border bg-panel-elevated p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Roadmap de evolução</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {PHASE_ORDER.map((phase, idx) => (
            <div key={phase} className="relative rounded-xl border border-border bg-panel p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 font-mono text-xs text-primary">
                  {idx + 1}
                </span>
                <p className="font-semibold text-foreground">{PHASE_LABEL[phase]}</p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{PHASE_DESCRIPTION[phase]}</p>
              <p className="mt-3 font-display text-lg text-foreground">{totals.byPhase[phase]}</p>
              {idx < PHASE_ORDER.length - 1 && (
                <ArrowRight className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground md:block" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Lista por instituição */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => {
          const phase = normalizePhase(row.current_phase);
          const next = nextPhase(phase);
          const isAuto = phase === "auto";
          const isAdvancing = advancingId === row.id;
          return (
            <div key={row.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-panel-elevated p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-foreground">{row.institution}</p>
                  <Badge variant={isAuto ? "default" : "secondary"} className="mt-1.5">
                    {isAuto && <Sparkles className="mr-1 h-3 w-3" />}
                    {PHASE_LABEL[phase]}
                  </Badge>
                </div>
                <ReconciliationFormDialog row={row} onSaved={onChanged} />
              </div>

              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">Progresso</span>
                  <span className={`font-display text-xl ${statusVariant(row.progress_pct)}`}>{row.progress_pct}%</span>
                </div>
                <Progress value={row.progress_pct} className="mt-1 h-2 bg-muted" />
              </div>

              {row.note && <p className="text-xs text-muted-foreground">{row.note}</p>}

              <div className="mt-auto flex gap-2">
                {next ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => handleAdvance(row)}
                    disabled={isAdvancing}
                  >
                    {isAdvancing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1 h-3.5 w-3.5" />}
                    Avançar para {PHASE_LABEL[next]}
                  </Button>
                ) : (
                  <div className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-success/10 px-3 py-1.5 text-xs font-semibold text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Open Finance ativo
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ReconciliationOverview;
