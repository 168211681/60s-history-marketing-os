import { formatNumber } from "@/lib/analytics";
import { sampleWeeklyViews } from "@/lib/sample-data";

export function TrendChart() {
  const max = Math.max(...sampleWeeklyViews.map((week) => week.views));
  return (
    <div>
      <div className="trend-bars" aria-hidden="true">
        {sampleWeeklyViews.map((week) => (
          <div className="bar-column" key={week.label}>
            <span>{formatNumber(week.views)}</span>
            <div
              className="bar"
              style={{ height: `${(week.views / max) * 145}px` }}
            />
            <span className="muted">{week.label}</span>
          </div>
        ))}
      </div>
      <details className="chart-details">
        <summary>View weekly sample values</summary>
        <table>
          <caption className="sr-only">Sample weekly views</caption>
          <thead>
            <tr>
              <th scope="col">Week</th>
              <th scope="col">Views</th>
            </tr>
          </thead>
          <tbody>
            {sampleWeeklyViews.map((week) => (
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
