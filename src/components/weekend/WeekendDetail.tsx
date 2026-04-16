import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  fmtMin,
  fmtClock,
  weekKey,
  weekLabel,
  getDow,
} from "@/lib/weekendCalc";
import WeekendStatCard from "./WeekendStatCard";
import type { WkRecord, WkEmployee, WkSite } from "@/lib/weekendTypes";

interface Props {
  records: WkRecord[];
  employees: Record<string, WkEmployee>;
  sites: Record<string, WkSite>;
  selectedName: string | null;
  onSelectName: (name: string) => void;
  onEditRecord: (key: string) => void;
}

export default function WeekendDetail({
  records,
  employees,
  sites,
  selectedName,
  onSelectName,
  onEditRecord,
}: Props) {
  // 전체 인원 목록 (중복 제거, 가나다순)
  const allNames = useMemo(() => {
    const names = Array.from(new Set(records.map((r) => r.name)));
    return names.sort((a, b) => a.localeCompare(b, "ko"));
  }, [records]);

  // 선택된 인원의 레코드
  const personRows = useMemo(() => {
    if (!selectedName) return [];
    return records
      .filter((r) => r.name === selectedName)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [records, selectedName]);

  // 차트 데이터: 월별 집계
  const chartData = useMemo(() => {
    if (personRows.length === 0) return [];
    const monthMap: Record<string, number> = {};
    for (const r of personRows) {
      const month = r.date.slice(0, 7); // YYYY-MM
      monthMap[month] = (monthMap[month] ?? 0) + r.workMinutes;
    }
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, mins]) => ({
        month: month.slice(5) + "월", // MM월
        hours: parseFloat((mins / 60).toFixed(1)),
      }));
  }, [personRows]);

  // 주차별 그룹핑
  const groupedRows = useMemo(() => {
    if (personRows.length === 0) return [];
    const groups: Record<string, WkRecord[]> = {};
    for (const r of personRows) {
      const wk = weekKey(r.date);
      if (!groups[wk]) groups[wk] = [];
      groups[wk].push(r);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [personRows]);

  // 선택 인원 정보
  const emp = selectedName ? employees[selectedName] : null;
  const siteName = emp?.site ? (sites[emp.site]?.name ?? emp.site) : null;

  // 통계
  const totalDays = personRows.length;
  const totalMins = personRows.reduce((s, r) => s + r.workMinutes, 0);

  return (
    <div className="space-y-4">
      {/* 인원 선택 드롭다운 */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          인원 선택
        </label>
        <select
          className="border border-border rounded-md px-3 py-1.5 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
          value={selectedName ?? ""}
          onChange={(e) => onSelectName(e.target.value)}
        >
          <option value="">-- 선택 --</option>
          {allNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* 빈 상태 */}
      {!selectedName && (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          인원을 선택하면 상세 정보가 표시됩니다.
        </div>
      )}

      {selectedName && (
        <>
          {/* 4개 통계 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-border col-span-2 md:col-span-1">
              <div className="text-xs text-muted-foreground mb-1">이름</div>
              <div className="text-xl font-bold">{selectedName}</div>
              {emp && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {[emp.organization, emp.position].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>

            <WeekendStatCard
              label="현장"
              value={
                siteName ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    {siteName}
                  </span>
                ) as unknown as string : (
                  <span className="text-muted-foreground text-sm">미지정</span>
                ) as unknown as string
              }
              icon="🏗️"
            />

            <WeekendStatCard
              label="주말출근일수"
              value={`${totalDays}일`}
              icon="📅"
            />

            <WeekendStatCard
              label="누적근무시간"
              value={fmtMin(totalMins)}
              icon="⏱️"
            />
          </div>

          {/* 월별 바 차트 */}
          {chartData.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-border">
              <div className="text-sm font-medium mb-3 text-muted-foreground">
                월별 근무시간 (h)
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(v: number) => [`${v}h`, "근무시간"]}
                    labelStyle={{ fontSize: 12 }}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="hours" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 상세 테이블 */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">날짜</th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground">요일</th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground">출근</th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground">퇴근</th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground">체류</th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground">점심</th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground">근무</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">경고</th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground">수정</th>
                </tr>
              </thead>
              <tbody>
                {groupedRows.map(([wk, rows]) => {
                  const weekWorkSum = rows.reduce((s, r) => s + r.workMinutes, 0);
                  return (
                    <>
                      {rows.map((r) => (
                        <tr
                          key={r.key}
                          className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                        >
                          <td className="px-3 py-2 tabular-nums">{r.date}</td>
                          <td className="px-3 py-2 text-center">{getDow(r.date)}</td>
                          <td className="px-3 py-2 text-center tabular-nums">
                            {r.checkIn ? fmtClock(new Date(r.checkIn)) : "-"}
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums">
                            {r.checkOut ? fmtClock(new Date(r.checkOut)) : "-"}
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums">
                            {r.stayMinutes ? fmtMin(r.stayMinutes) : "-"}
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums">
                            {r.lunchMinutes ? fmtMin(r.lunchMinutes) : "-"}
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums font-bold">
                            {fmtMin(r.workMinutes)}
                          </td>
                          <td className="px-3 py-2">
                            {r.warnings.length > 0 && (
                              <span className="text-xs text-amber-600 dark:text-amber-400">
                                {r.warnings.join(", ")}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => onEditRecord(r.key)}
                              className="text-xs px-2 py-0.5 rounded border border-border hover:bg-muted transition-colors"
                            >
                              수정
                            </button>
                          </td>
                        </tr>
                      ))}
                      {/* 주간 소계 행 */}
                      <tr className="bg-muted/30 border-b border-border">
                        <td
                          colSpan={6}
                          className="px-3 py-1.5 text-xs text-muted-foreground"
                        >
                          {weekLabel(wk)} 소계
                        </td>
                        <td className="px-3 py-1.5 text-center text-xs font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                          {fmtMin(weekWorkSum)}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
