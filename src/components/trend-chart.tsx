import { formatNumber } from "@/lib/analytics";
import type { WeeklyViews } from "@/lib/data/workspace";

export function TrendChart({ values, source }: { values: readonly WeeklyViews[]; source: "sample" | "live" }) {
  const max = Math.max(0, ...values.map((week) => week.views ?? 0));
  return (
    <div>
      <div className="trend-bars" aria-hidden="true">
        {values.map((week) => (
          <div className="bar-column" key={week.label}>
            <span>{formatNumber(week.views)}</span>
            <div
              className="bar"
              style={{ height: `${max > 0 ? ((week.views ?? 0) / max) * 145 : 0}px` }}
            />
            <span className="muted">{week.label}</span>
          </div>
        ))}
      </div>
      <details className="chart-details">
        <summary>View weekly {source === "sample" ? "sample" : "analytics"} values</summary>
        <table>
          <caption className="sr-only">Weekly {source === "sample" ? "sample" : "channel"} views</caption>
          <thead>
            <tr>
              <th scope="col">Week</th>
              <th scope="col">Views</th>
            </tr>
          </thead>
          <tbody>
            {values.map((week) => (
              <tr key={week.label}>
                <th scope="row">{week.label}</th>
                <td>{formatNumber(week.views)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
