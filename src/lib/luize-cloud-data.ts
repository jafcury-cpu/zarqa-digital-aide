import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import {
  activeAlerts as fallbackAlerts,
  financeCategoryData as fallbackFinanceCategoryData,
  financeTransactions as fallbackTransactions,
  healthSnapshot as fallbackHealthSnapshot,
  healthSparkline as fallbackHealthSparkline,
  healthTrend as fallbackHealthTrend,
  upcomingBills as fallbackBills,
  type Priority,
} from "@/lib/luize-mocks";

export type DashboardAlert = {
  id: string;
  module: string;
  message: string;
  priority: Priority;
};

export type BillItem = {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  status: string;
};

export type TransactionItem = {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  status: string;
};

export type HealthSnapshotData = {
  overallScore: number;
  sleepHours: number;
  sleepQuality: number;
  hrv: number;
  steps: number;
  calories: number;
};

export type HealthTrendPoint = {
  day: string;
  score: number;
  sleep: number;
};

export type FinanceCategoryPoint = {
  category: string;
  total: number;
};

export type DashboardData = {
  activeAlerts: DashboardAlert[];
  upcomingBills: BillItem[];
  healthSnapshot: HealthSnapshotData;
  healthSparkline: number[];
  pulse: {
    cashCommitted: number;
    urgentItems: number;
    documentReviews: number;
  };
};

export type FinanceData = {
  transactions: TransactionItem[];
  upcomingBills: BillItem[];
  categoryData: FinanceCategoryPoint[];
  summary: {
    totalBalance: number;
    entries: number;
    exits: number;
  };
};

export type HealthData = {
  healthSnapshot: HealthSnapshotData;
  healthTrend: HealthTrendPoint[];
};

const seededUsers = new Set<string>();
const pendingSeeds = new Map<string, Promise<void>>();

function createBaseDate(offsetInDays = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetInDays);
  return date;
}

function createTimestamp(offsetInDays: number, hour: number, minute = 0) {
  const date = createBaseDate(offsetInDays);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function createDateOnly(offsetInDays: number) {
  return createBaseDate(offsetInDays).toISOString().slice(0, 10);
}

function formatWeekday(date: string) {
  const label = new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
    .format(new Date(`${date}T12:00:00`))
    .replace(".", "")
    .slice(0, 3);

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function normalizePriority(priority?: string): Priority {
  if (priority === "high" || priority === "medium" || priority === "low") return priority;
  return "medium";
}

function buildSeedPayload(userId: string) {
  const alerts: TablesInsert<"alerts">[] = [
    {
      user_id: userId,
      module: "Financeiro",
      message: "Fatura premium vence em menos de 48h.",
      priority: "high",
      created_at: createTimestamp(-1, 8, 15),
      is_read: false,
    },
    {
      user_id: userId,
      module: "Saúde",
      message: "Média de sono caiu abaixo da meta semanal.",
      priority: "medium",
      created_at: createTimestamp(-1, 7, 50),
      is_read: false,
    },
    {
      user_id: userId,
      module: "Documentos",
      message: "Procuração com revisão prevista para este mês.",
      priority: "low",
      created_at: createTimestamp(-2, 18, 20),
      is_read: false,
    },
  ];

  const bills: TablesInsert<"bills">[] = [
    {
      user_id: userId,
      description: "Condomínio Vila Nova",
      amount: 2850,
      due_date: createDateOnly(1),
      status: "pendente",
    },
    {
      user_id: userId,
      description: "Plano de saúde premium",
      amount: 1940,
      due_date: createDateOnly(2),
      status: "pendente",
    },
    {
      user_id: userId,
      description: "IPTU apartamento",
      amount: 3120,
      due_date: createDateOnly(4),
      status: "atrasado",
    },
    {
      user_id: userId,
      description: "Escola - parcela",
      amount: 1680,
      due_date: createDateOnly(5),
      status: "pago",
      paid_at: createTimestamp(0, 9, 20),
    },
  ];

  const transactions: TablesInsert<"transactions">[] = [
    {
      user_id: userId,
      description: "Restaurante Fasano",
      amount: -680,
      category: "Lazer",
      date: createDateOnly(-1),
      status: "pago",
    },
    {
      user_id: userId,
      description: "Mensalidade academia",
      amount: -420,
      category: "Saúde",
      date: createDateOnly(-2),
      status: "pago",
    },
    {
      user_id: userId,
      description: "Aluguel escritório",
      amount: -5800,
      category: "Moradia",
      date: createDateOnly(-3),
      status: "pago",
    },
    {
      user_id: userId,
      description: "Dividendos fundos",
      amount: 9400,
      category: "Receitas",
      date: createDateOnly(-5),
      status: "pago",
    },
    {
      user_id: userId,
      description: "Passagens aéreas",
      amount: -1980,
      category: "Transporte",
      date: createDateOnly(-6),
      status: "pendente",
    },
    {
      user_id: userId,
      description: "Escola - matrícula",
      amount: -2100,
      category: "Educação",
      date: createDateOnly(-7),
      status: "pago",
    },
  ];

  const healthScores: TablesInsert<"health_scores">[] = [
    { user_id: userId, date: createDateOnly(-6), overall_score: 74, sleep_hours: 6.3, sleep_quality: 82, hrv: 51, steps: 8120, calories: 1980 },
    { user_id: userId, date: createDateOnly(-5), overall_score: 76, sleep_hours: 6.9, sleep_quality: 85, hrv: 55, steps: 9340, calories: 2040 },
    { user_id: userId, date: createDateOnly(-4), overall_score: 78, sleep_hours: 7.2, sleep_quality: 87, hrv: 57, steps: 9760, calories: 2110 },
    { user_id: userId, date: createDateOnly(-3), overall_score: 82, sleep_hours: 7.6, sleep_quality: 89, hrv: 60, steps: 10580, calories: 2180 },
    { user_id: userId, date: createDateOnly(-2), overall_score: 80, sleep_hours: 7.1, sleep_quality: 86, hrv: 58, steps: 9920, calories: 2140 },
    { user_id: userId, date: createDateOnly(-1), overall_score: 85, sleep_hours: 7.8, sleep_quality: 90, hrv: 61, steps: 11240, calories: 2210 },
    { user_id: userId, date: createDateOnly(0), overall_score: 88, sleep_hours: 8.1, sleep_quality: 91, hrv: 62, steps: 11840, calories: 2240 },
  ];

  return { alerts, bills, transactions, healthScores };
}

export async function ensureZarqaDemoData(userId: string) {
  if (!userId) return;
  if (seededUsers.has(userId)) return;

  const existingSeed = pendingSeeds.get(userId);
  if (existingSeed) {
    await existingSeed;
    return;
  }

  const seedPromise = (async () => {
    const { alerts, bills, transactions, healthScores } = buildSeedPayload(userId);

    const [alertsCount, billsCount, transactionsCount, healthCount] = await Promise.all([
      supabase.from("alerts").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("bills").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("health_scores").select("id", { count: "exact", head: true }).eq("user_id", userId),
    ]);

    const countErrors = [alertsCount.error, billsCount.error, transactionsCount.error, healthCount.error].filter(Boolean);
    if (countErrors.length) {
      throw new Error(countErrors[0]?.message || "Não foi possível validar a seed de demonstração.");
    }

    const operations = [];

    if ((alertsCount.count ?? 0) === 0) operations.push(supabase.from("alerts").insert(alerts));
    if ((billsCount.count ?? 0) === 0) operations.push(supabase.from("bills").insert(bills));
    if ((transactionsCount.count ?? 0) === 0) operations.push(supabase.from("transactions").insert(transactions));
    if ((healthCount.count ?? 0) === 0) operations.push(supabase.from("health_scores").insert(healthScores));

    if (operations.length) {
      const results = await Promise.all(operations);
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
    }

    seededUsers.add(userId);
  })();

  pendingSeeds.set(userId, seedPromise);

  try {
    await seedPromise;
  } finally {
    pendingSeeds.delete(userId);
  }
}

function mapBills(items: Array<{ id: string; description: string; amount: number; due_date: string; status: string }>): BillItem[] {
  return items.map((bill) => ({
    id: bill.id,
    description: bill.description,
    amount: Number(bill.amount),
    dueDate: bill.due_date,
    status: bill.status,
  }));
}

function mapTransactions(
  items: Array<{ id: string; description: string; amount: number; category: string; date: string; status: string }>,
): TransactionItem[] {
  return items.map((transaction) => ({
    id: transaction.id,
    description: transaction.description,
    amount: Number(transaction.amount),
    category: transaction.category,
    date: transaction.date,
    status: transaction.status,
  }));
}

function buildCategoryData(transactions: TransactionItem[]): FinanceCategoryPoint[] {
  const totals = transactions.reduce<Record<string, number>>((accumulator, transaction) => {
    if (transaction.amount >= 0) return accumulator;
    accumulator[transaction.category] = (accumulator[transaction.category] ?? 0) + Math.abs(transaction.amount);
    return accumulator;
  }, {});

  return Object.entries(totals)
    .map(([category, total]) => ({ category, total }))
    .sort((first, second) => second.total - first.total);
}

function buildHealthTrend(
  items: Array<{
    date: string;
    overall_score: number;
    sleep_hours: number;
  }>,
): HealthTrendPoint[] {
  return items.map((item) => ({
    day: formatWeekday(item.date),
    score: item.overall_score,
    sleep: Number(item.sleep_hours),
  }));
}

export function getFallbackDashboardData(): DashboardData {
  return {
    activeAlerts: fallbackAlerts,
    upcomingBills: fallbackBills.map((bill) => ({ ...bill, dueDate: bill.dueDate })),
    healthSnapshot: fallbackHealthSnapshot,
    healthSparkline: fallbackHealthSparkline,
    pulse: {
      cashCommitted: 38,
      urgentItems: 3,
      documentReviews: 2,
    },
  };
}

export function getFallbackFinanceData(): FinanceData {
  return {
    transactions: fallbackTransactions,
    upcomingBills: fallbackBills.map((bill) => ({ ...bill, dueDate: bill.dueDate })),
    categoryData: fallbackFinanceCategoryData,
    summary: {
      totalBalance: fallbackTransactions.reduce((accumulator, item) => accumulator + item.amount, 0),
      entries: fallbackTransactions.filter((item) => item.amount > 0).reduce((accumulator, item) => accumulator + item.amount, 0),
      exits: Math.abs(fallbackTransactions.filter((item) => item.amount < 0).reduce((accumulator, item) => accumulator + item.amount, 0)),
    },
  };
}

export function getFallbackHealthData(): HealthData {
  return {
    healthSnapshot: fallbackHealthSnapshot,
    healthTrend: fallbackHealthTrend,
  };
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  await ensureZarqaDemoData(userId);

  const [alertsResult, billsResult, healthResult, transactionsResult] = await Promise.all([
    supabase.from("alerts").select("id, module, message, priority").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
    supabase.from("bills").select("id, description, amount, due_date, status").eq("user_id", userId).order("due_date", { ascending: true }),
    supabase
      .from("health_scores")
      .select("date, overall_score, sleep_hours, sleep_quality, hrv, steps, calories")
      .eq("user_id", userId)
      .order("date", { ascending: true })
      .limit(7),
    supabase.from("transactions").select("amount, status").eq("user_id", userId),
  ]);

  const errors = [alertsResult.error, billsResult.error, healthResult.error, transactionsResult.error].filter(Boolean);
  if (errors.length) throw new Error(errors[0]?.message || "Falha ao carregar dados do dashboard.");

  const alerts = (alertsResult.data ?? []).map((alert) => ({
    id: alert.id,
    module: alert.module,
    message: alert.message,
    priority: normalizePriority(alert.priority),
  }));
  const bills = mapBills(billsResult.data ?? []);
  const healthScores = healthResult.data ?? [];
  const latestHealth = healthScores.at(-1);
  const transactions = transactionsResult.data ?? [];
  const pendingBillsTotal = bills.filter((bill) => bill.status !== "pago").reduce((accumulator, bill) => accumulator + bill.amount, 0);
  const totalOutflow = Math.abs(transactions.filter((item) => item.amount < 0).reduce((accumulator, item) => accumulator + Number(item.amount), 0));

  return {
    activeAlerts: alerts.length ? alerts : getFallbackDashboardData().activeAlerts,
    upcomingBills: bills.length ? bills : getFallbackDashboardData().upcomingBills,
    healthSnapshot: latestHealth
      ? {
          overallScore: latestHealth.overall_score,
          sleepHours: Number(latestHealth.sleep_hours),
          sleepQuality: latestHealth.sleep_quality,
          hrv: latestHealth.hrv,
          steps: latestHealth.steps,
          calories: latestHealth.calories,
        }
      : getFallbackDashboardData().healthSnapshot,
    healthSparkline: healthScores.length ? healthScores.map((item) => item.overall_score) : getFallbackDashboardData().healthSparkline,
    pulse: {
      cashCommitted: totalOutflow ? Math.min(100, Math.round((pendingBillsTotal / totalOutflow) * 100)) : getFallbackDashboardData().pulse.cashCommitted,
      urgentItems: alerts.filter((alert) => alert.priority === "high").length + bills.filter((bill) => bill.status === "atrasado").length,
      documentReviews: 2,
    },
  };
}

export async function getFinanceData(userId: string): Promise<FinanceData> {
  await ensureZarqaDemoData(userId);

  const [transactionsResult, billsResult] = await Promise.all([
    supabase.from("transactions").select("id, description, amount, category, date, status").eq("user_id", userId).order("date", { ascending: false }),
    supabase.from("bills").select("id, description, amount, due_date, status").eq("user_id", userId).order("due_date", { ascending: true }),
  ]);

  const errors = [transactionsResult.error, billsResult.error].filter(Boolean);
  if (errors.length) throw new Error(errors[0]?.message || "Falha ao carregar dados financeiros.");

  const transactions = mapTransactions(transactionsResult.data ?? []);
  const bills = mapBills(billsResult.data ?? []);
  const entries = transactions.filter((item) => item.amount > 0).reduce((accumulator, item) => accumulator + item.amount, 0);
  const exits = Math.abs(transactions.filter((item) => item.amount < 0).reduce((accumulator, item) => accumulator + item.amount, 0));

  return {
    transactions: transactions.length ? transactions : getFallbackFinanceData().transactions,
    upcomingBills: bills.length ? bills : getFallbackFinanceData().upcomingBills,
    categoryData: transactions.length ? buildCategoryData(transactions) : getFallbackFinanceData().categoryData,
    summary: {
      totalBalance: transactions.length ? transactions.reduce((accumulator, item) => accumulator + item.amount, 0) : getFallbackFinanceData().summary.totalBalance,
      entries: transactions.length ? entries : getFallbackFinanceData().summary.entries,
      exits: transactions.length ? exits : getFallbackFinanceData().summary.exits,
    },
  };
}

export async function getHealthData(userId: string): Promise<HealthData> {
  await ensureZarqaDemoData(userId);

  const { data, error } = await supabase
    .from("health_scores")
    .select("date, overall_score, sleep_hours, sleep_quality, hrv, steps, calories")
    .eq("user_id", userId)
    .order("date", { ascending: true })
    .limit(7);

  if (error) throw new Error(error.message || "Falha ao carregar dados de saúde.");

  const latest = data?.at(-1);
  if (!data?.length || !latest) return getFallbackHealthData();

  return {
    healthSnapshot: {
      overallScore: latest.overall_score,
      sleepHours: Number(latest.sleep_hours),
      sleepQuality: latest.sleep_quality,
      hrv: latest.hrv,
      steps: latest.steps,
      calories: latest.calories,
    },
    healthTrend: buildHealthTrend(data),
  };
}