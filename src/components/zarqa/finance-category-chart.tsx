import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type FinanceCategoryPoint = {
  category: string;
  total: number;
};

export default function FinanceCategoryChart({ data }: { data: FinanceCategoryPoint[] }) {
  return (
    <div className="h-[320px] rounded-2xl border border-border bg-panel-elevated p-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 12, left: -10, bottom: 0 }}>
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
  );
}