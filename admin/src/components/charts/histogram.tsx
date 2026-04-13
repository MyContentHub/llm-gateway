import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface HistogramProps {
  data: { name: string; value: number }[];
  color?: string;
}

function getBarColor(index: number, total: number): string {
  const ratio = total <= 1 ? 0 : index / (total - 1);
  if (ratio < 0.33) return "#22c55e";
  if (ratio < 0.66) return "#f97316";
  return "#ef4444";
}

export function Histogram({ data, color }: HistogramProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--card))",
            fontSize: 12,
          }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((_, i) =>
            color ? (
              <Cell key={i} fill={color} />
            ) : (
              <Cell key={i} fill={getBarColor(i, data.length)} />
            ),
          )}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
