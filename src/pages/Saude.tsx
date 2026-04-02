import { lazy, useEffect, useState } from "react";
import { DeferredLazySection } from "@/components/zarqa/deferred-lazy-section";
import { LoadingPanel } from "@/components/zarqa/loading-panel";
import { SectionCard } from "@/components/zarqa/section-card";
import { healthSnapshot, healthTrend } from "@/lib/zarqa-mocks";

const metricCards = [
  { label: "Sono", value: `${healthSnapshot.sleepHours}h`, detail: `${healthSnapshot.sleepQuality}% qualidade` },
  { label: "HRV", value: `${healthSnapshot.hrv}`, detail: "variabilidade cardíaca" },
  { label: "Passos", value: `${healthSnapshot.steps.toLocaleString("pt-BR")}`, detail: "meta diária superada" },
  { label: "Calorias", value: `${healthSnapshot.calories}`, detail: "gasto estimado" },
];

const Saude = () => {
  const [loading, setLoading] = useState(true);
  const HealthTrendChart = lazy(() => import("@/components/zarqa/health-trend-chart"));

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 950);
    return () => window.clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        <LoadingPanel lines={5} />
        <LoadingPanel lines={5} />
        <LoadingPanel lines={6} />
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <SectionCard title="Score Diário" description="Leitura consolidada de recuperação e consistência" eyebrow="Health score" className="xl:col-span-4">
        {/* TODO: conectar com n8n webhook */}
        <div className="rounded-2xl border border-border bg-panel-elevated p-6">
          <p className="font-display text-7xl leading-none text-foreground">{healthSnapshot.overallScore}</p>
          <p className="mt-3 text-base text-muted-foreground">
            Estado atual acima da média, com recuperação sólida e boa aderência a movimento.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Sinais Vitais e Hábitos" description="Indicadores do dia" eyebrow="Metrics" className="xl:col-span-8">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((metric) => (
            <div key={metric.label} className="rounded-2xl border border-border bg-panel-elevated p-4">
              <p className="text-kicker">{metric.label}</p>
              <p className="mt-3 font-display text-3xl text-foreground">{metric.value}</p>
              <p className="mt-2 text-sm text-muted-foreground">{metric.detail}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Tendência dos últimos 7 dias" description="Score e padrão de sono" eyebrow="Weekly trend" className="xl:col-span-12">
        {/* TODO: conectar com n8n webhook */}
        <DeferredLazySection component={HealthTrendChart} minHeightClassName="min-h-[340px]" />
      </SectionCard>
    </div>
  );
};

export default Saude;
