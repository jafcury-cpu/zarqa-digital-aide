import { useMemo, useState } from "react";
import { CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import type { BillItem } from "@/lib/luize-cloud-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatDate, getStatusVariant } from "@/lib/luize-mocks";

type StatusFilter = "todos" | "pendente" | "atrasado" | "pago";
type WindowFilter = "7" | "14" | "30" | "all";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function dayLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return `${Math.abs(diff)}d atrás`;
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  if (diff < 7) return WEEKDAY_LABELS[target.getDay()];
  return target.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function statusIcon(status: string) {
  if (status === "pago") return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (status === "atrasado") return <AlertTriangle className="h-4 w-4 text-destructive" />;
  return <Clock className="h-4 w-4 text-warning" />;
}

export function UpcomingBillsTimeline({ bills }: { bills: BillItem[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [windowFilter, setWindowFilter] = useState<WindowFilter>("14");

  const counts = useMemo(() => {
    const c = { pendente: 0, atrasado: 0, pago: 0, total: bills.length };
    bills.forEach((b) => {
      if (b.status === "pendente") c.pendente++;
      else if (b.status === "atrasado") c.atrasado++;
      else if (b.status === "pago") c.pago++;
    });
    return c;
  }, [bills]);

  const filtered = useMemo(() => {
    const todayMs = new Date().setHours(0, 0, 0, 0);
    const horizon = windowFilter === "all" ? Infinity : todayMs + Number(windowFilter) * 86_400_000;
    return bills
      .filter((b) => {
        if (statusFilter !== "todos" && b.status !== statusFilter) return false;
        const due = new Date(b.dueDate).getTime();
        // Mostra atrasados sempre (mesmo fora da janela), e o resto dentro da janela
        if (b.status === "atrasado") return true;
        return due <= horizon;
      })
      .sort((a, b) => {
        // Atrasados primeiro, depois por data ascendente
        if (a.status === "atrasado" && b.status !== "atrasado") return -1;
        if (b.status === "atrasado" && a.status !== "atrasado") return 1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
  }, [bills, statusFilter, windowFilter]);

  const totalAmount = useMemo(
    () => filtered.filter((b) => b.status !== "pago").reduce((sum, b) => sum + b.amount, 0),
    [filtered],
  );

  return (
    <div className="space-y-4">
      {/* KPIs por estado */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === "atrasado" ? "todos" : "atrasado")}
          className={`rounded-xl border p-3 text-left transition ${
            statusFilter === "atrasado" ? "border-destructive bg-destructive/10" : "border-border bg-panel-elevated hover:border-destructive/40"
          }`}
        >
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Atrasados</p>
          <p className="mt-1 font-display text-xl text-destructive">{counts.atrasado}</p>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === "pendente" ? "todos" : "pendente")}
          className={`rounded-xl border p-3 text-left transition ${
            statusFilter === "pendente" ? "border-warning bg-warning/10" : "border-border bg-panel-elevated hover:border-warning/40"
          }`}
        >
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Pendentes</p>
          <p className="mt-1 font-display text-xl text-warning">{counts.pendente}</p>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === "pago" ? "todos" : "pago")}
          className={`rounded-xl border p-3 text-left transition ${
            statusFilter === "pago" ? "border-success bg-success/10" : "border-border bg-panel-elevated hover:border-success/40"
          }`}
        >
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Pagos</p>
          <p className="mt-1 font-display text-xl text-success">{counts.pago}</p>
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={windowFilter} onValueChange={(v) => setWindowFilter(v as WindowFilter)}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Próximos 7 dias</SelectItem>
            <SelectItem value="14">Próximos 14 dias</SelectItem>
            <SelectItem value="30">Próximos 30 dias</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
        {statusFilter !== "todos" && (
          <Button variant="ghost" size="sm" onClick={() => setStatusFilter("todos")}>
            Limpar status: {statusFilter}
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "item" : "itens"} • a pagar:{" "}
          <span className="font-semibold text-foreground">{formatCurrency(totalAmount)}</span>
        </span>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="rounded-xl border border-border bg-panel-elevated p-4 text-sm text-muted-foreground">
            Nenhum vencimento corresponde aos filtros.
          </p>
        )}
        {filtered.map((bill) => {
          const due = new Date(bill.dueDate);
          const isOverdue = bill.status === "atrasado";
          return (
            <div
              key={bill.id}
              className={`rounded-xl border p-3 ${
                isOverdue ? "border-destructive/50 bg-destructive/5" : "border-border bg-panel-elevated"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {statusIcon(bill.status)}
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {dayLabel(due)}
                    </p>
                    <Badge variant={getStatusVariant(bill.status)} className="ml-auto md:hidden">
                      {bill.status}
                    </Badge>
                  </div>
                  <p className="mt-1.5 truncate font-medium text-foreground">{bill.description}</p>
                  <p className="text-xs text-muted-foreground">Vence {formatDate(bill.dueDate)}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-lg text-foreground">{formatCurrency(bill.amount)}</p>
                  <Badge variant={getStatusVariant(bill.status)} className="mt-1 hidden md:inline-flex">
                    {bill.status}
                  </Badge>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default UpcomingBillsTimeline;
