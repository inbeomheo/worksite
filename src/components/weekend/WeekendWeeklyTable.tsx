import { useMemo } from "react";
import { fmtHours, weekKey, weekLabel, heatClass } from "@/lib/weekendCalc";
import type { WkRecord, WkEmployee, WkSite } from "@/lib/weekendTypes";

interface Props {
  records: WkRecord[];
  employees: Record<string, WkEmployee>;
  sites: Record<string, WkSite>;
  onSelectPerson: (name: string) => void;
}

// ---------------------------------------------------------------------------
// Site badge helper
// ---------------------------------------------------------------------------
function getSiteBadge(site: string | null): { label: string; className: string } {
  if (!site) {
    return { label: "미지정", className: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400" };
  }
  if (site === "초순수") {
    return { label: site, className: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300" };
  }
  if (site === "그린동") {
    return { label: site, className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" };
  }
  return { label: site, className: "bg-muted text-muted-foreground" };
}

// ---------------------------------------------------------------------------
// Heat legend
// ---------------------------------------------------------------------------
const HEAT_LEGEND: { cls: string; label: string }[] = [
  { cls: "wk-heat-1", label: "~2h" },
  { cls: "wk-heat-2", label: "2~4h" },
  { cls: "wk-heat-3", label: "4~6h" },
  { cls: "wk-heat-4", label: "6~8h" },
  { cls: "wk-heat-5", label: "8h+" },
];

export default function WeekendWeeklyTable({
  records,
  employees,
  sites,
  onSelectPerson,
}: Props) {
  // -----------------------------------------------------------------------
  // Build grid: name → week → workMinutes
  // -----------------------------------------------------------------------
  const { weeks, names, grid, rowTotals, colTotals, grandTotal } = useMemo(() => {
    const weekSet = new Set<string>();
    const nameSet = new Set<string>();
    const rawGrid: Record<string, Record<string, number>> = {};

    for (const rec of records) {
      const wk = weekKey(rec.date);
      weekSet.add(wk);
      nameSet.add(rec.name);

      if (!rawGrid[rec.name]) rawGrid[rec.name] = {};
      rawGrid[rec.name][wk] = (rawGrid[rec.name][wk] ?? 0) + rec.workMinutes;
    }

    const weeks = Array.from(weekSet).sort();

    // Row totals (sum over all weeks)
    const rowTotalsMap: Record<string, number> = {};
    for (const name of nameSet) {
      rowTotalsMap[name] = weeks.reduce((s, wk) => s + (rawGrid[name]?.[wk] ?? 0), 0);
    }

    // Sort names desc by total
    const names = Array.from(nameSet).sort(
      (a, b) => (rowTotalsMap[b] ?? 0) - (rowTotalsMap[a] ?? 0)
    );

    // Column totals
    const colTotals: Record<string, number> = {};
    for (const wk of weeks) {
      colTotals[wk] = names.reduce((s, name) => s + (rawGrid[name]?.[wk] ?? 0), 0);
    }
    const grandTotal = weeks.reduce((s, wk) => s + colTotals[wk], 0);

    return { weeks, names, grid: rawGrid, rowTotals: rowTotalsMap, colTotals, grandTotal };
  }, [records]);

  if (records.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <div className="text-4xl mb-3">📭</div>
        <div className="font-medium">데이터가 없습니다</div>
        <div className="text-sm mt-1">주말 근무 기록을 업로드해 주세요.</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="text-sm border-collapse w-full">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground text-xs">
              {/* Sticky left: 이름 */}
              <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left whitespace-nowrap border-r border-border">
                이름
              </th>
              {/* Sticky left: 현장 */}
              <th className="sticky left-[80px] z-10 bg-muted/50 px-3 py-2 text-left whitespace-nowrap border-r border-border">
                현장
              </th>
              {/* Sticky left: 합계 */}
              <th className="sticky left-[160px] z-10 bg-muted/50 px-3 py-2 text-right whitespace-nowrap border-r border-border font-bold">
                합계
              </th>
              {/* Week columns */}
              {weeks.map((wk) => (
                <th
                  key={wk}
                  className="px-2 py-2 text-center whitespace-nowrap min-w-[64px]"
                  title={weekLabel(wk)}
                >
                  {weekLabel(wk).replace(/^\d{4} /, "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {names.map((name) => {
              const emp = employees[name];
              const site = emp?.site ?? null;
              const badge = getSiteBadge(site);
              const total = rowTotals[name] ?? 0;

              return (
                <tr
                  key={name}
                  className="hover:bg-muted/30 transition-colors"
                >
                  {/* 이름 */}
                  <td
                    className="sticky left-0 z-10 bg-background px-3 py-1.5 font-medium whitespace-nowrap border-r border-border cursor-pointer hover:text-primary"
                    onClick={() => onSelectPerson(name)}
                  >
                    {name}
                  </td>
                  {/* 현장 */}
                  <td className="sticky left-[80px] z-10 bg-background px-3 py-1.5 whitespace-nowrap border-r border-border">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  {/* 합계 */}
                  <td className="sticky left-[160px] z-10 bg-background px-3 py-1.5 text-right tabular-nums font-bold whitespace-nowrap border-r border-border">
                    {fmtHours(total)}h
                  </td>
                  {/* Week cells */}
                  {weeks.map((wk) => {
                    const mins = grid[name]?.[wk] ?? 0;
                    const cls = heatClass(mins);
                    return (
                      <td
                        key={wk}
                        className={`px-2 py-1.5 text-center tabular-nums text-xs ${cls ? cls + " font-medium" : "text-muted-foreground"}`}
                        title={mins ? `${name} | ${weekLabel(wk)}: ${fmtHours(mins)}h` : undefined}
                      >
                        {mins ? fmtHours(mins) : "·"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          {/* Total row */}
          <tfoot>
            <tr className="bg-muted/50 font-bold text-xs border-t-2 border-border">
              <td className="sticky left-0 z-10 bg-muted/50 px-3 py-2 whitespace-nowrap border-r border-border">
                합계
              </td>
              <td className="sticky left-[80px] z-10 bg-muted/50 px-3 py-2 border-r border-border" />
              <td className="sticky left-[160px] z-10 bg-muted/50 px-3 py-2 text-right tabular-nums border-r border-border">
                {fmtHours(grandTotal)}h
              </td>
              {weeks.map((wk) => {
                const mins = colTotals[wk] ?? 0;
                return (
                  <td
                    key={wk}
                    className="px-2 py-2 text-center tabular-nums"
                    title={`${weekLabel(wk)} 합계: ${fmtHours(mins)}h`}
                  >
                    {fmtHours(mins)}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Heat legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground px-1">
        <span className="font-medium">열감:</span>
        {HEAT_LEGEND.map(({ cls, label }) => (
          <span key={cls} className="flex items-center gap-1">
            <span className={`inline-block w-5 h-3 rounded ${cls}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
