export type Priority = "high" | "medium" | "low";

export const briefingText =
  "Mercados estáveis, agenda concentrada no período da tarde e atenção alta para despesas de vencimento imediato. Priorize decisões financeiras até 14h e reserve 30 minutos para revisão documental.";

export const upcomingAppointments = [
  { id: "evt-1", title: "Call com family office", time: "09:30", location: "Meet" },
  { id: "evt-2", title: "Revisão jurídica imóvel Itaim", time: "11:00", location: "Escritório" },
  { id: "evt-3", title: "Treino funcional", time: "13:30", location: "Bodytech" },
  { id: "evt-4", title: "Consulta cardiologista", time: "17:10", location: "Jardins" },
  { id: "evt-5", title: "Jantar com investidor", time: "20:00", location: "Fasano" },
];

export const upcomingBills = [
  { id: "bill-1", description: "Condomínio Vila Nova", amount: 2850, dueDate: "2026-05-03", status: "pendente" },
  { id: "bill-2", description: "Plano de saúde premium", amount: 1940, dueDate: "2026-05-04", status: "pendente" },
  { id: "bill-3", description: "IPTU apartamento", amount: 3120, dueDate: "2026-05-06", status: "atrasado" },
  { id: "bill-4", description: "Escola - parcela", amount: 1680, dueDate: "2026-05-07", status: "pago" },
];

export const activeAlerts: Array<{ id: string; module: string; message: string; priority: Priority }> = [
  { id: "alert-1", module: "Financeiro", message: "Fatura premium vence em menos de 48h.", priority: "high" },
  { id: "alert-2", module: "Saúde", message: "Média de sono caiu abaixo da meta semanal.", priority: "medium" },
  { id: "alert-3", module: "Documentos", message: "Procuração com revisão prevista para este mês.", priority: "low" },
];

export const healthSparkline = [72, 75, 74, 79, 83, 81, 86];

export const financeCategoryData = [
  { category: "Moradia", total: 12800 },
  { category: "Saúde", total: 6400 },
  { category: "Transporte", total: 2500 },
  { category: "Educação", total: 4200 },
  { category: "Lazer", total: 3100 },
];

export const financeTransactions = [
  { id: "tx-1", description: "Restaurante Fasano", amount: -680, category: "Lazer", date: "2026-04-01", status: "pago" },
  { id: "tx-2", description: "Mensalidade academia", amount: -420, category: "Saúde", date: "2026-03-31", status: "pago" },
  { id: "tx-3", description: "Aluguel escritório", amount: -5800, category: "Moradia", date: "2026-03-30", status: "pago" },
  { id: "tx-4", description: "Dividendos fundos", amount: 9400, category: "Receitas", date: "2026-03-28", status: "pago" },
  { id: "tx-5", description: "Passagens aéreas", amount: -1980, category: "Transporte", date: "2026-03-27", status: "pendente" },
  { id: "tx-6", description: "Escola - matrícula", amount: -2100, category: "Educação", date: "2026-03-26", status: "pago" },
];

export const healthTrend = [
  { day: "Seg", score: 74, sleep: 6.3 },
  { day: "Ter", score: 76, sleep: 6.9 },
  { day: "Qua", score: 78, sleep: 7.2 },
  { day: "Qui", score: 82, sleep: 7.6 },
  { day: "Sex", score: 80, sleep: 7.1 },
  { day: "Sáb", score: 85, sleep: 7.8 },
  { day: "Dom", score: 88, sleep: 8.1 },
];

export const healthSnapshot = {
  overallScore: 88,
  sleepHours: 7.8,
  sleepQuality: 91,
  hrv: 62,
  steps: 11840,
  calories: 2240,
};

export const fallbackDocuments = [
  {
    id: "doc-1",
    name: "Contrato Locação Itaim.pdf",
    category: "Jurídico",
    file_url: "",
    created_at: "2026-03-30T10:30:00Z",
    preview: "Contrato principal com aditivos e garantias.",
  },
  {
    id: "doc-2",
    name: "Apólice Saúde Familiar.pdf",
    category: "Saúde",
    file_url: "",
    created_at: "2026-03-29T18:00:00Z",
    preview: "Coberturas, carências e contatos prioritários.",
  },
  {
    id: "doc-3",
    name: "Relatório Patrimonial Março.xlsx",
    category: "Financeiro",
    file_url: "",
    created_at: "2026-03-27T08:45:00Z",
    preview: "Resumo mensal de posições, liquidez e obrigações.",
  },
];

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatDate(date: string) {
  // Append noon time to avoid UTC-to-local day shift for Brazilian users (UTC-3)
  const normalized = date.length === 10 ? `${date}T12:00:00` : date;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(normalized));
}

export function formatDateTime(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function priorityLabel(priority: Priority) {
  if (priority === "high") return "Crítico";
  if (priority === "medium") return "Atenção";
  return "Estável";
}

export function getPriorityVariant(priority: Priority) {
  if (priority === "high") return "critical" as const;
  if (priority === "medium") return "warning" as const;
  return "success" as const;
}

export function getStatusVariant(status: string) {
  if (status === "pago") return "success" as const;
  if (status === "atrasado") return "critical" as const;
  return "warning" as const;
}
