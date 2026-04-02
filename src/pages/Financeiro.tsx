import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LoadingPanel } from "@/components/zarqa/loading-panel";
import { SectionCard } from "@/components/zarqa/section-card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  financeCategoryData,
  financeTransactions,
  formatCurrency,
  formatDate,
  getStatusVariant,
  upcomingBills,
} from "@/lib/zarqa-mocks";

const Financeiro = () => {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 850);
    return () => window.clearTimeout(timer);
  }, []);

  const filteredTransactions = useMemo(
    () =>
      financeTransactions.filter((transaction) => {
        const matchesSearch = transaction.description.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === "todos" || transaction.status === statusFilter;
        return matchesSearch && matchesStatus;
      }),
    [search, statusFilter],
  );

  const totalBalance = financeTransactions.reduce((acc, item) => acc + item.amount, 0);
  const upcomingSevenDays = upcomingBills.slice(0, 3);

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
    <div className="grid gap-4 xl:grid-cols-12">
      <SectionCard title="Saldo Total" description="Posição consolidada dos últimos 30 dias" eyebrow="Cash position" className="xl:col-span-4">
        <div className="space-y-4 rounded-2xl border border-border bg-panel-elevated p-5">
          <p className="font-display text-5xl leading-none text-foreground">{formatCurrency(totalBalance)}</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-border bg-panel p-3">
              <p className="text-muted-foreground">Entradas</p>
              <p className="mt-2 font-display text-2xl text-success">{formatCurrency(9400)}</p>
            </div>
            <div className="rounded-xl border border-border bg-panel p-3">
              <p className="text-muted-foreground">Saídas</p>
              <p className="mt-2 font-display text-2xl text-primary">{formatCurrency(12980)}</p>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Gastos por Categoria" description="Últimos 30 dias" eyebrow="Allocation view" className="xl:col-span-8">
        <div className="h-[320px] rounded-2xl border border-border bg-panel-elevated p-4">
          {/* TODO: conectar com n8n webhook */}
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={financeCategoryData} margin={{ top: 16, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="category" stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => `R$${value / 1000}k`} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: "hsl(var(--panel))" }}
                contentStyle={{
                  background: "hsl(var(--panel))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "16px",
                  color: "hsl(var(--foreground))",
                }}
              />
              <Bar dataKey="total" fill="hsl(var(--primary))" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Transações Recentes" description="Busca e filtro operacional" eyebrow="Ledger" className="xl:col-span-8">
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
  );
};

export default Financeiro;
