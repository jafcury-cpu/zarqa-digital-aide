import { lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/integrations/supabase/client";
import { DeferredLazySection } from "@/components/zarqa/deferred-lazy-section";
import { LoadingPanel } from "@/components/zarqa/loading-panel";
import { SectionCard } from "@/components/zarqa/section-card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { getFallbackFinanceData, getFinanceData, type FinanceData } from "@/lib/zarqa-cloud-data";
import { BankAccountFormDialog } from "@/components/zarqa/bank-account-form-dialog";
import { CreditCardFormDialog } from "@/components/zarqa/credit-card-form-dialog";
import { ReconciliationFormDialog } from "@/components/zarqa/reconciliation-form-dialog";
import {
  formatCurrency,
  formatDate,
  getStatusVariant,
} from "@/lib/zarqa-mocks";
import {
  ArrowUpRight,
  BadgeAlert,
  CalendarClock,
  CreditCard,
  Landmark,
  ReceiptText,
  ScanSearch,
  Wallet,
} from "lucide-react";

type Metric = {
  label: string;
  value: string;
  delta: string;
  tone: "primary" | "success" | "warning";
};

type BankAccount = {
  id: string;
  bank_name: string;
  account_type: string;
  description: string | null;
  balance: number;
  reconciliation_pct: number;
  reconciliation_note: string | null;
};

type CreditCardRow = {
  id: string;
  card_name: string;
  brand: string;
  credit_limit: number;
  used_amount: number;
  closing_day: number;
  due_day: number;
};

type ReconciliationRow = {
  id: string;
  institution: string;
  progress_pct: number;
  current_phase: string;
  note: string | null;
};

type TimelineItem = { day: string; title: string; amount: string; meta: string };

const defaultTimeline: TimelineItem[] = [
  { day: "Hoje", title: "Fatura C6 Black", amount: "R$ 1.140", meta: "vence em 3 dias" },
  { day: "Amanhã", title: "Boleto condomínio", amount: "R$ 780", meta: "agendado no Itaú" },
  { day: "Sex", title: "Conciliação Bradesco", amount: "12 lançamentos", meta: "2 divergências" },
  { day: "Seg", title: "Fechamento Visa Itaú", amount: "R$ 2.040", meta: "limite usado 64%" },
];

const defaultBankAccounts: BankAccount[] = [
  { id: "1", bank_name: "Itaú", account_type: "corrente", description: "Conta principal da casa", balance: 0, reconciliation_pct: 92, reconciliation_note: "OFX e conciliação automática preparados" },
  { id: "2", bank_name: "Bradesco", account_type: "corrente", description: "Reserva e despesas do casal", balance: 0, reconciliation_pct: 74, reconciliation_note: "último extrato importado hoje" },
  { id: "3", bank_name: "C6", account_type: "corrente", description: "Conta conectada ao cartão", balance: 0, reconciliation_pct: 61, reconciliation_note: "cartão ativo e boletos vinculados" },
];

const defaultCreditCards: CreditCardRow[] = [
  { id: "1", card_name: "Itaú Visa", brand: "Visa", credit_limit: 10000, used_amount: 6400, closing_day: 10, due_day: 17 },
  { id: "2", card_name: "Bradesco Elo", brand: "Elo", credit_limit: 10000, used_amount: 3200, closing_day: 18, due_day: 25 },
  { id: "3", card_name: "C6 Black", brand: "Mastercard", credit_limit: 10000, used_amount: 5100, closing_day: 8, due_day: 15 },
];

const defaultReconciliation: ReconciliationRow[] = [
  { id: "1", institution: "Itaú", progress_pct: 92, current_phase: "manual", note: "OFX e conciliação automática preparados" },
  { id: "2", institution: "Bradesco", progress_pct: 74, current_phase: "manual", note: "último extrato importado hoje" },
  { id: "3", institution: "C6", progress_pct: 61, current_phase: "manual", note: "cartão ativo e boletos vinculados" },
];

const modules = [
  {
    icon: Wallet,
    title: "Despesas pessoais",
    description: "Categorias, lançamentos recorrentes, contas compartilhadas e visão mensal consolidada.",
  },
  {
    icon: CreditCard,
    title: "Cartões de crédito",
    description: "Fechamento, vencimento, limite, parcelas e faturas separadas por banco e titular.",
  },
  {
    icon: ReceiptText,
    title: "Boletos e contas",
    description: "Controle de vencimentos, pagamentos e alertas de atraso com histórico centralizado.",
  },
  {
    icon: ScanSearch,
    title: "Conciliação bancária",
    description: "Importação manual agora, Open Finance na próxima etapa, com revisão de divergências.",
  },
];

const toneStyles: Record<Metric["tone"], string> = {
  primary: "bg-primary/20 text-primary",
  success: "bg-success/20 text-success",
  warning: "bg-warning/20 text-warning",
};

const FinanceCategoryChart = lazy(() => import("@/components/zarqa/finance-category-chart"));

const Financeiro = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [financeData, setFinanceData] = useState<FinanceData>(getFallbackFinanceData());
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(defaultBankAccounts);
  const [creditCards, setCreditCards] = useState<CreditCardRow[]>(defaultCreditCards);
  const [reconciliation, setReconciliation] = useState<ReconciliationRow[]>(defaultReconciliation);

  const reloadDynamic = useCallback(async () => {
    if (!user) return;
    try {
      const [baResult, ccResult, rcResult] = await Promise.all([
        supabase.from("bank_accounts").select("*").order("bank_name"),
        supabase.from("credit_cards").select("*").order("card_name"),
        supabase.from("reconciliation_status").select("*").order("institution"),
      ]);
      if (baResult.data) setBankAccounts(baResult.data as unknown as BankAccount[]);
      if (ccResult.data) setCreditCards(ccResult.data as unknown as CreditCardRow[]);
      if (rcResult.data) setReconciliation(rcResult.data as unknown as ReconciliationRow[]);
    } catch { /* silent */ }
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [finResult, baResult, ccResult, rcResult] = await Promise.all([
          getFinanceData(user.id),
          supabase.from("bank_accounts").select("*").order("bank_name"),
          supabase.from("credit_cards").select("*").order("card_name"),
          supabase.from("reconciliation_status").select("*").order("institution"),
        ]);

        if (!cancelled) {
          setFinanceData(finResult);
          if (baResult.data && baResult.data.length > 0) setBankAccounts(baResult.data as unknown as BankAccount[]);
          if (ccResult.data && ccResult.data.length > 0) setCreditCards(ccResult.data as unknown as CreditCardRow[]);
          if (rcResult.data && rcResult.data.length > 0) setReconciliation(rcResult.data as unknown as ReconciliationRow[]);
        }
      } catch (error) {
        if (!cancelled) {
          setFinanceData(getFallbackFinanceData());
          toast({
            variant: "destructive",
            title: "Falha ao carregar financeiro",
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

  const filteredTransactions = useMemo(
    () =>
      financeData.transactions.filter((transaction) => {
        const matchesSearch = transaction.description.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === "todos" || transaction.status === statusFilter;
        return matchesSearch && matchesStatus;
      }),
    [financeData.transactions, search, statusFilter],
  );

  const upcomingSevenDays = financeData.upcomingBills.slice(0, 3);

  const metrics: Metric[] = useMemo(() => {
    const pendingBills = financeData.upcomingBills.filter((b) => b.status === "pendente");
    const overdueBills = financeData.upcomingBills.filter((b) => b.status === "atrasado");
    return [
      {
        label: "Saída do mês",
        value: formatCurrency(financeData.summary.exits),
        delta: `${financeData.transactions.filter((t) => t.amount < 0).length} transações`,
        tone: "warning",
      },
      {
        label: "Faturas abertas",
        value: formatCurrency(pendingBills.reduce((s, b) => s + b.amount, 0)),
        delta: `${pendingBills.length} pendentes`,
        tone: "primary",
      },
      {
        label: "Boletos atrasados",
        value: formatCurrency(overdueBills.reduce((s, b) => s + b.amount, 0)),
        delta: overdueBills.length ? `${overdueBills.length} vencem esta semana` : "Nenhum atraso",
        tone: overdueBills.length ? "warning" : "success",
      },
      {
        label: "Entradas",
        value: formatCurrency(financeData.summary.entries),
        delta: `${financeData.transactions.filter((t) => t.amount > 0).length} receitas`,
        tone: "success",
      },
    ];
  }, [financeData]);

  const reconciliationCompletion = useMemo(
    () => {
      const source = reconciliation.length > 0 ? reconciliation : defaultReconciliation;
      return Math.round(source.reduce((sum, item) => sum + item.progress_pct, 0) / source.length);
    },
    [reconciliation],
  );

  if (loading) {
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        <LoadingPanel lines={5} />
        <LoadingPanel lines={5} />
        <LoadingPanel lines={6} />
        <LoadingPanel lines={5} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Row 1: Summary + Reconciliation */}
      <div className="grid gap-4 xl:grid-cols-12">
        <SectionCard title="Saldo Total" description="Posição consolidada dos últimos 30 dias" eyebrow="Cash position" className="xl:col-span-4">
          <div className="space-y-4 rounded-2xl border border-border bg-panel-elevated p-5">
            <p className="font-display text-5xl leading-none text-foreground">{formatCurrency(financeData.summary.totalBalance)}</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-border bg-panel p-3">
                <p className="text-muted-foreground">Entradas</p>
                <p className="mt-2 font-display text-2xl text-success">{formatCurrency(financeData.summary.entries)}</p>
              </div>
              <div className="rounded-xl border border-border bg-panel p-3">
                <p className="text-muted-foreground">Saídas</p>
                <p className="mt-2 font-display text-2xl text-primary">{formatCurrency(financeData.summary.exits)}</p>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Prontidão da Conciliação" description="Status por instituição bancária" eyebrow="Reconciliation" className="xl:col-span-4">
          <div className="rounded-2xl border border-border bg-panel-elevated p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Progresso geral</p>
                <p className="mt-2 font-display text-4xl text-foreground">{reconciliationCompletion}%</p>
              </div>
              <div className="rounded-2xl bg-primary/15 p-3 text-primary">
                <Landmark className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-5 space-y-4">
              {reconciliation.map((bank) => (
                <div key={bank.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-foreground">{bank.institution}</span>
                    <span className="text-muted-foreground">{bank.progress_pct}%</span>
                  </div>
                  <Progress value={bank.progress_pct} className="h-2 bg-muted" />
                  <p className="text-xs text-muted-foreground">{bank.note}</p>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Contas nos próximos 7 dias" description="Janela tática de vencimentos" eyebrow="Due soon" className="xl:col-span-4">
          <div className="space-y-3">
            {upcomingSevenDays.map((bill) => (
              <div key={bill.id} className="rounded-xl border border-border bg-panel-elevated p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{bill.description}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Vence {formatDate(bill.dueDate)}</p>
                  </div>
                  <Badge variant={getStatusVariant(bill.status)}>{bill.status}</Badge>
                </div>
                <p className="mt-3 font-display text-2xl text-foreground">{formatCurrency(bill.amount)}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Row 2: KPI metrics */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((item) => (
          <div key={item.label} className="rounded-2xl border border-border bg-panel p-5">
            <p className="text-sm text-muted-foreground">{item.label}</p>
            <p className="mt-2 font-display text-3xl text-foreground">{item.value}</p>
            <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${toneStyles[item.tone]}`}>
              {item.delta}
            </span>
          </div>
        ))}
      </div>

      {/* Row 3: Category chart + Timeline */}
      <div className="grid gap-4 xl:grid-cols-12">
        <SectionCard title="Gastos por Categoria" description="Últimos 30 dias" eyebrow="Allocation view" className="xl:col-span-8">
          <DeferredLazySection component={FinanceCategoryChart} componentProps={{ data: financeData.categoryData }} minHeightClassName="min-h-[320px]" />
        </SectionCard>

        <SectionCard title="Próximos vencimentos" description="Agenda operacional de pagamentos" eyebrow="Timeline" className="xl:col-span-4">
          <div className="space-y-3">
            {defaultTimeline.map((item) => (
              <div key={`${item.day}-${item.title}`} className="rounded-xl border border-border bg-panel-elevated p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{item.day}</p>
                    <p className="mt-2 font-medium text-foreground">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.meta}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-foreground">{item.amount}</p>
                    <ArrowUpRight className="ml-auto mt-2 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Row 4: Transactions table */}
      <SectionCard title="Transações Recentes" description="Busca e filtro operacional" eyebrow="Ledger">
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px]">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por descrição" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filtrar por status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="atrasado">Atrasado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-2xl border border-border bg-panel-elevated p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="font-medium text-foreground">{transaction.description}</TableCell>
                  <TableCell>{transaction.category}</TableCell>
                  <TableCell>{formatDate(transaction.date)}</TableCell>
                  <TableCell className={transaction.amount < 0 ? "text-primary" : "text-success"}>{formatCurrency(transaction.amount)}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(transaction.status)}>{transaction.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      {/* Row 5: Modules grid */}
      <SectionCard title="Módulos do Sistema Financeiro" description="Organizado para controlar rotina, faturas, boletos e divergências" eyebrow="Capabilities">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {modules.map(({ icon: Icon, title, description }) => (
            <div key={title} className="rounded-2xl border border-border bg-panel-elevated p-5">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Row 6: Tabs — Contas, Cartões, Conciliação */}
      <SectionCard title="Visão Detalhada" description="Separação por contas, cartões e conciliação" eyebrow="Deep dive">
        <Tabs defaultValue="contas" className="space-y-4">
          <TabsList className="h-auto flex-wrap rounded-full bg-muted/70 p-1">
            <TabsTrigger className="rounded-full px-5" value="contas">Contas</TabsTrigger>
            <TabsTrigger className="rounded-full px-5" value="cartoes">Cartões</TabsTrigger>
            <TabsTrigger className="rounded-full px-5" value="conciliacao">Conciliação</TabsTrigger>
          </TabsList>

          <TabsContent value="contas">
            <div className="mb-3 flex justify-end">
              <BankAccountFormDialog onSaved={reloadDynamic} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {bankAccounts.map((account) => (
                <div key={account.id} className="rounded-2xl border border-border bg-panel-elevated p-5">
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-semibold text-muted-foreground">{account.bank_name}</p>
                    <BankAccountFormDialog account={account} onSaved={reloadDynamic} />
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">{account.description || account.account_type}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Saldo: {formatCurrency(account.balance)} • Conciliação: {account.reconciliation_pct}%
                  </p>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="cartoes">
            <div className="mb-3 flex justify-end">
              <CreditCardFormDialog onSaved={reloadDynamic} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {creditCards.map((card) => (
                <div key={card.id} className="rounded-2xl border border-border bg-panel-elevated p-5">
                  <div className="flex items-start justify-between">
                    <CreditCard className="h-5 w-5 text-primary" />
                    <CreditCardFormDialog card={card} onSaved={reloadDynamic} />
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-foreground">{card.card_name}</h3>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {card.credit_limit > 0 ? `${Math.round((card.used_amount / card.credit_limit) * 100)}% do limite usado` : "Sem limite definido"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    fecha dia {String(card.closing_day).padStart(2, "0")} • vence dia {String(card.due_day).padStart(2, "0")}
                  </p>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="conciliacao">
            <div className="mb-3 flex justify-end">
              <ReconciliationFormDialog onSaved={reloadDynamic} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {reconciliation.map((row) => (
                <div key={row.id} className="rounded-2xl border border-border bg-panel-elevated p-5">
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-semibold text-foreground">{row.institution}</p>
                    <ReconciliationFormDialog row={row} onSaved={reloadDynamic} />
                  </div>
                  <p className="mt-2 font-display text-2xl text-foreground">{row.progress_pct}%</p>
                  <Progress value={row.progress_pct} className="mt-2 h-2 bg-muted" />
                  <p className="mt-2 text-xs text-muted-foreground">Fase: {row.current_phase}</p>
                  {row.note && <p className="mt-1 text-xs text-muted-foreground">{row.note}</p>}
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </SectionCard>
    </div>
  );
};

export default Financeiro;
