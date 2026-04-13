import { lazy, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { DeferredLazySection } from "@/components/zarqa/deferred-lazy-section";
import { LoadingPanel } from "@/components/zarqa/loading-panel";
import { SectionCard } from "@/components/zarqa/section-card";
import { useToast } from "@/hooks/use-toast";
import { getFallbackHealthData, getHealthData, type HealthData } from "@/lib/zarqa-cloud-data";

const Saude = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [healthData, setHealthData] = useState<HealthData>(getFallbackHealthData());
  const HealthTrendChart = lazy(() => import("@/components/zarqa/health-trend-chart"));

  const metricCards = [
    { label: "Sono", value: `${healthData.healthSnapshot.sleepHours}h`, detail: `${healthData.healthSnapshot.sleepQuality}% qualidade` },
    { label: "HRV", value: `${healthData.healthSnapshot.hrv}`, detail: "variabilidade cardíaca" },
    { label: "Passos", value: `${healthData.healthSnapshot.steps.toLocaleString("pt-BR")}`, detail: "meta diária superada" },
    { label: "Calorias", value: `${healthData.healthSnapshot.calories}`, detail: "gasto estimado" },
  ];

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await getHealthData(user.id);
        if (!cancelled) setHealthData(data);
      } catch (error) {
        if (!cancelled) {
          setHealthData(getFallbackHealthData());
          toast({
            variant: "destructive",
            title: "Falha ao carregar saúde",
            description: error instanceof Error ? error.message : "Usando dados de demonstração locais.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [toast, user]);

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
          <p className="font-display text-7xl leading-none text-foreground">{healthData.healthSnapshot.overallScore}</p>
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
         <DeferredLazySection component={HealthTrendChart} componentProps={{ data: healthData.healthTrend }} minHeightClassName="min-h-[340px]" />
      </SectionCard>
    </div>
  );
};

export default Saude;
