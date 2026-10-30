import { useId } from "react";
import { BarChart3, ArrowUpRight } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { countLabel, number } from "./presentation";
type ChartPoint = { key: string; label: string; fullLabel: string; total: number };
export function DistributionChart({
  points,
  label,
  help,
  onOpen,
  empty,
  formatCount = countLabel,
}: {
  points: ChartPoint[];
  label: string;
  help: string;
  onOpen: (point: ChartPoint) => void;
  empty: string;
  formatCount?: (value: number) => string;
}) {
  const uid = useId();
  const maximum = Math.max(0, ...points.map((point) => point.total));
  return (
    <>
      {maximum ? (
        <div className="agenda-dashboard-chart" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={points}
              margin={{ top: 15, right: 5, bottom: 0, left: -24 }}
              barCategoryGap="25%"
            >
              <CartesianGrid vertical={false} strokeDasharray="3 6" stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={12}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                content={({ active, payload }) => {
                  const point = payload?.[0]?.payload as ChartPoint | undefined;
                  return active && point ? (
                    <div className="agenda-dashboard-tooltip">
                      <strong>{point.fullLabel}</strong>
                      <span>{formatCount(point.total)}</span>
                    </div>
                  ) : null;
                }}
              />
              <Bar
                dataKey="total"
                radius={[5, 5, 0, 0]}
                maxBarSize={34}
                isAnimationActive={false}
                cursor="pointer"
                onClick={(point: ChartPoint) => {
                  if (point.total) onOpen(point);
                }}
              >
                {points.map((point) => (
                  <Cell
                    key={point.key}
                    fill={
                      point.total === maximum ? "var(--dashboard-peak)" : "var(--dashboard-chart)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="agenda-dashboard-chart-empty">
          <BarChart3 size={26} aria-hidden="true" />
          <p>{empty}</p>
        </div>
      )}
      <details className="agenda-dashboard-values">
        <summary aria-controls={uid}>Ver valores e abrir eventos</summary>
        <div id={uid} className="agenda-dashboard-values-list" role="list" aria-label={label}>
          {points.map((point) => (
            <div key={point.key} role="listitem">
              <button
                type="button"
                disabled={!point.total}
                onClick={() => onOpen(point)}
                aria-label={`${point.fullLabel}: ${formatCount(point.total)}. Abrir eventos.`}
              >
                <span>{point.fullLabel}</span>
                <b>{number.format(point.total)}</b>
                {point.total > 0 && <ArrowUpRight size={14} aria-hidden="true" />}
              </button>
            </div>
          ))}
        </div>
      </details>
      <p className="agenda-dashboard-help">{help}</p>
    </>
  );
}
