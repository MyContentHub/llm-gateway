import type { ComponentType } from "react";

type P = Record<string, any>;

declare module "recharts" {
  export const ResponsiveContainer: ComponentType<P>;
  export const BarChart: ComponentType<P>;
  export const PieChart: ComponentType<P>;
  export const Bar: ComponentType<P>;
  export const XAxis: ComponentType<P>;
  export const YAxis: ComponentType<P>;
  export const Tooltip: ComponentType<P>;
  export const Pie: ComponentType<P>;
  export const Cell: ComponentType<P>;
}
