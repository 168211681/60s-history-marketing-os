import type { ReactNode } from "react";
import {
  formatNumber,
  formatDuration,
  type AnalyticsSummary,
} from "@/lib/analytics";

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {action}
    </header>
  );
}
export function Panel({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {description ? <p className="muted text-sm">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span aria-hidden="true" className="empty-symbol">
        ◌
      </span>
      <h3>{title}</h3>
      <div className="muted">{children}</div>
    </div>
  );
}
export function MetricCards({ metrics, periodLabel }: { metrics: AnalyticsSummary; periodLabel: string }) {
  const cards = [
    ["Total views", formatNumber(metrics.views), `Across ${periodLabel}`],
    [
      "Watch time",
      metrics.watchHours === null ? "No data" : `${formatNumber(metrics.watchHours)} hrs`,
      "Estimated minutes converted to hours",
    ],
    [
      "Subscriber growth",
      metrics.netSubscribers === null
        ? "No data"
        : `${metrics.netSubscribers >= 0 ? "+" : ""}${formatNumber(metrics.netSubscribers)}`,
      `${formatNumber(metrics.gained)} gained · ${formatNumber(metrics.lost)} lost`,
    ],
    [
      "Avg. view duration",
      formatDuration(metrics.averageViewSeconds),
      "Weighted by views across all videos",
    ],
  ];
  return (
    <div className="metrics">
      {cards.map(([label, value, detail]) => (
        <section className="metric" key={label}>
          <h2>{label}</h2>
          <p className="metric-value">{value}</p>
          <p className="muted text-xs">{detail}</p>
        </section>
      ))}
    </div>
  );
}
