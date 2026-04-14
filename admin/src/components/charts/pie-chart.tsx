import { PieChart as RechartsPieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

interface PieChartProps {
  data: { name: string; value: number }[];
}

const COLORS: Record<string, string> = {
  success: "#22c55e",
  error: "#ef4444",
  blocked: "#f97316",
};

const DEFAULT_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"];

export function PieChartComponent({ data }: PieChartProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-[240px] text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width="100%" height={200}>
        <RechartsPieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell
                key={entry.name}
                fill={COLORS[entry.name] ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              fontSize: 12,
            }}
          />
        </RechartsPieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-2 min-w-[80px]">
        {data.map((entry, index) => (
          <div key={entry.name} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: COLORS[entry.name] ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length] }}
            />
            <span className="text-muted-foreground capitalize">{entry.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
