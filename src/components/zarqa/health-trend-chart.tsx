import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { healthTrend } from "@/lib/zarqa-mocks";

export default function HealthTrendChart() {
  return (
    <div className="h-[340px] rounded-2xl border border-border bg-panel-elevated p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={healthTrend} margin={{ top: 18, right: 18, left: -10, bottom: 0 }}>
          <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
          <YAxis stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--panel))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "16px",
              color: "hsl(var(--foreground))",
            }}
          />
          <Line type="monotone" dataKey="score" stroke="hsl(var(--accent-blue))" strokeWidth={3} dot={{ r: 4, fill: "hsl(var(--accent-blue))" }} />
          <Line type="monotone" dataKey="sleep" stroke="hsl(var(--primary))" strokeWidth={2.4} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}