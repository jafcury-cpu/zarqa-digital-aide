import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, CalendarClock, FileWarning, Siren, WalletCards } from "lucide-react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { LoadingPanel } from "@/components/zarqa/loading-panel";
import { SectionCard } from "@/components/zarqa/section-card";
import { Badge } from "@/components/ui/badge";
import { useSaoPauloTime } from "@/hooks/use-sao-paulo-time";
import {
  activeAlerts,
  briefingText,
  formatCurrency,
  formatDate,
  getPriorityVariant,
  getStatusVariant,
  healthSnapshot,
  healthSparkline,
  priorityLabel,
  upcomingAppointments,
  upcomingBills,
} from "@/lib/zarqa-mocks";

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const { full, short } = useSaoPauloTime();

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 900);
    return () => window.clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <LoadingPanel lines={5} />
        <LoadingPanel lines={5} />
        <LoadingPanel lines={5} />
        <LoadingPanel lines={4} />
        <LoadingPanel lines={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="surface-elevated relative overflow-hidden px-6 py-6 md:px-8">
        <div className="absolute inset-0 bg-hero opacity-90" />
        <div className="absolute inset-0 grid-tech opacity-20" />
        <div className="relative z-10 grid gap-6 lg:grid-cols-[1.5fr_0.8fr] lg:items-end">
          <div className="space-y-3">
            <p className="text-kicker">Central de Operação Pessoal</p>
            <h2 className="text-4xl font-semibold tracking-tight text-foreground">ZARQA ٢٨</h2>
            <p className="max-w-2xl text-base text-muted-foreground">
              Painel executivo para coordenar compromissos, alertas críticos, finanças e saúde com visão única.
            </p>
          </div>
          <div className="justify-self-start rounded-2xl border border-border/80 bg-panel/80 p-4 backdrop-blur lg:justify-self-end">
            <p className="text-kicker">São Paulo · GMT-3</p>
            <p className="mt-2 font-display text-3xl text-foreground">{short}</p>
            <p className="mt-1 text-sm text-muted-foreground">{full}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-12">
        <SectionCard
          title="Briefing do Dia"
          description="Síntese executiva com prioridades, riscos e agenda"
          eyebrow="Daily briefing"
          className="xl:col-span-5"
          action={<Badge variant="info">Atualização 07:00</Badge>}
        >
          {/* TODO: conectar com n8n webhook */}
          <p className="text-base leading-7 text-foreground/90">{briefingText}</p>
        </SectionCard>

        <SectionCard
          title="Próximos Compromissos"
          description="Top 5 compromissos priorizados"
          eyebrow="Agenda"
          className="xl:col-span-4"
        >
          {/* TODO: conectar com n8n webhook */}
          <div className="space-y-3">
            {upcomingAppointments.map((event) => (
              <div key={event.id} className="flex items-center justify-between rounded-xl border border-border bg-panel-elevated p-3">
                <div>
                  <p className="font-medium text-foreground">{event.title}</p>
                  <p className="text-sm text-muted-foreground">{event.location}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-lg text-foreground">{event.time}</p>
                  <CalendarClock className="ml-auto mt-1 size-4 text-accent-blue" />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Alertas Ativos" description="Sinais operacionais abertos" eyebrow="Risk radar" className="xl:col-span-3">
          {/* TODO: conectar com n8n webhook */}
          <div className="space-y-3">
            {activeAlerts.map((alert) => (
              <div key={alert.id} className="rounded-xl border border-border bg-panel-elevated p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">{alert.module}</span>
                  <Badge variant={getPriorityVariant(alert.priority)}>{priorityLabel(alert.priority)}</Badge>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{alert.message}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Contas a Vencer"
          description="Vencimentos em horizonte imediato"
          eyebrow="Cash pressure"
          className="xl:col-span-6"
        >
          {/* TODO: conectar com n8n webhook */}
          <div className="space-y-3">
            {upcomingBills.map((bill) => (
              <div key={bill.id} className="grid gap-3 rounded-xl border border-border bg-panel-elevated p-4 md:grid-cols-[1fr_auto_auto] md:items-center">
                <div>
                  <p className="font-medium text-foreground">{bill.description}</p>
                  <p className="text-sm text-muted-foreground">Vence em {formatDate(bill.dueDate)}</p>
                </div>
                <p className="font-display text-lg text-foreground">{formatCurrency(bill.amount)}</p>
                <Badge variant={getStatusVariant(bill.status)}>{bill.status}</Badge>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Score de Saúde"
          description="Leitura consolidada do dia"
          eyebrow="Health telemetry"
          className="xl:col-span-3"
          action={<Activity className="size-4 text-accent-blue" />}
        >
          {/* TODO: conectar com n8n webhook */}
          <div className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="font-display text-6xl leading-none text-foreground">{healthSnapshot.overallScore}</p>
                <p className="mt-2 text-sm text-muted-foreground">Consistência acima da média semanal</p>
              </div>
              <ArrowUpRight className="size-5 text-success" />
            </div>
            <div className="h-20 rounded-xl border border-border bg-panel-elevated px-2 py-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={healthSparkline.map((score, index) => ({ index, score }))}>
                  <Line type="monotone" dataKey="score" stroke="hsl(var(--accent-blue))" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Pulse de Operação" description="Indicadores rápidos de leitura" eyebrow="Executive pulse" className="xl:col-span-3">
          <div className="grid gap-3">
            <div className="rounded-xl border border-border bg-panel-elevated p-4">
              <div className="flex items-center gap-3">
                <WalletCards className="size-4 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Caixa comprometido</p>
                  <p className="font-display text-2xl text-foreground">38%</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-panel-elevated p-4">
              <div className="flex items-center gap-3">
                <Siren className="size-4 text-warning" />
                <div>
                  <p className="text-sm text-muted-foreground">Itens urgentes</p>
                  <p className="font-display text-2xl text-foreground">03</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-panel-elevated p-4">
              <div className="flex items-center gap-3">
                <FileWarning className="size-4 text-accent-blue" />
                <div>
                  <p className="text-sm text-muted-foreground">Revisões documentais</p>
                  <p className="font-display text-2xl text-foreground">02</p>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>
      </section>
    </div>
  );
};

export default Dashboard;
