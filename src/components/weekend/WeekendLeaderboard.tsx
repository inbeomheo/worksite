import { useMemo, useState } from "react";
import { Search, Download } from "lucide-react";
import { fmtMin } from "@/lib/weekendCalc";
import { exportWeekendLeaderboardExcel } from "@/lib/weekendExportExcel";
import type { WkRecord, WkEmployee, WkSite } from "@/lib/weekendTypes";
import WeekendStatCard from "./WeekendStatCard";

interface Props {
  records: WkRecord[];
  employees: Record<string, WkEmployee>;
  sites: Record<string, WkSite>;
  yearFilter: string;
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
// Per-person aggregated row
// ---------------------------------------------------------------------------
interface PersonRow {
  name: string;
  position: string;
  site: string | null;
  dayCount: number;
  stayMinutes: number;
  workMinutes: number;
  hasWarnings: boolean;
  rank: number;
}

// ---------------------------------------------------------------------------
// Per-site stats
// ---------------------------------------------------------------------------
interface SiteStats {
  site: string | null;
  count: number;
  totalMinutes: number;
}

export default function WeekendLeaderboard({
  records,
  employees,
  sites,
  yearFilter,
  onSelectPerson,
}: Props) {
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState<string>("all");

  // ---------------------------------------------------------------------------
  // Derive all unique sites from records
  // ---------------------------------------------------------------------------
  const allSites = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.site) set.add(r.site);
    });
    return Array.from(set).sort();
  }, [records]);

  // ---------------------------------------------------------------------------
  // Filter records by year
  // ---------------------------------------------------------------------------
  const yearRecords = useMemo(() => {
    if (!yearFilter || yearFilter === "all") return records;
    return records.filter((r) => r.date.startsWith(yearFilter));
  }, [records, yearFilter]);

  // ---------------------------------------------------------------------------
  // Aggregate per person (all year-filtered records)
  // ---------------------------------------------------------------------------
  const personMap = useMemo(() => {
    const map = new Map<string, {
      name: string;
      position: string;
      site: string | null;
      days: Set<string>;
      stayMinutes: number;
      workMinutes: number;
      hasWarnings: boolean;
    }>();

    for (const rec of yearRecords) {
      if (!map.has(rec.name)) {
        const emp = employees[rec.name];
        map.set(rec.name, {
          name: rec.name,
          position: emp?.position ?? rec.position ?? "",
          site: rec.site,
          days: new Set(),
          stayMinutes: 0,
          workMinutes: 0,
          hasWarnings: false,
        });
      }
      const entry = map.get(rec.name)!;
      entry.days.add(rec.date);
      entry.stayMinutes += rec.stayMinutes;
      entry.workMinutes += rec.workMinutes;
      if (rec.warnings && rec.warnings.length > 0) entry.hasWarnings = true;
      // Use most recent site info
      const emp = employees[rec.name];
      if (emp?.site) entry.site = emp.site;
    }

    return map;
  }, [yearRecords, employees]);

  // ---------------------------------------------------------------------------
  // Sorted full list (desc by workMinutes) with rank
  // ---------------------------------------------------------------------------
  const sortedRows = useMemo((): PersonRow[] => {
    const rows = Array.from(personMap.values())
      .map((e) => ({
        name: e.name,
        position: e.position,
        site: e.site,
        dayCount: e.days.size,
        stayMinutes: e.stayMinutes,
        workMinutes: e.workMinutes,
        hasWarnings: e.hasWarnings,
        rank: 0,
      }))
      .sort((a, b) => b.workMinutes - a.workMinutes);

    rows.forEach((r, i) => (r.rank = i + 1));
    return rows;
  }, [personMap]);

  // ---------------------------------------------------------------------------
  // Top 4 stat cards
  // ---------------------------------------------------------------------------
  const stats = useMemo(() => {
    const totalPeople = sortedRows.length;
    const totalDays = sortedRows.reduce((s, r) => s + r.dayCount, 0);
    const totalMinutes = sortedRows.reduce((s, r) => s + r.workMinutes, 0);
    const avgMinutes = totalPeople > 0 ? Math.round(totalMinutes / totalPeople) : 0;
    return { totalPeople, totalDays, totalMinutes, avgMinutes };
  }, [sortedRows]);

  // ---------------------------------------------------------------------------
  // Per-site stats
  // ---------------------------------------------------------------------------
  const siteStats = useMemo((): SiteStats[] => {
    const map = new Map<string, { count: number; totalMinutes: number }>();

    for (const row of sortedRows) {
      const key = row.site ?? "__unassigned__";
      if (!map.has(key)) map.set(key, { count: 0, totalMinutes: 0 });
      const s = map.get(key)!;
      s.count += 1;
      s.totalMinutes += row.workMinutes;
    }

    return Array.from(map.entries()).map(([key, v]) => ({
      site: key === "__unassigned__" ? null : key,
      count: v.count,
      totalMinutes: v.totalMinutes,
    })).sort((a, b) => b.totalMinutes - a.totalMinutes);
  }, [sortedRows]);

  // ---------------------------------------------------------------------------
  // Filtered rows (search + site filter)
  // ---------------------------------------------------------------------------
  const filteredRows = useMemo(() => {
    return sortedRows.filter((r) => {
      const matchSearch =
        search.trim() === "" ||
        r.name.includes(search.trim()) ||
        r.position.includes(search.trim());
      const matchSite =
        siteFilter === "all" ||
        (siteFilter === "미지정" ? !r.site : r.site === siteFilter);
      return matchSearch && matchSite;
    });
  }, [sortedRows, search, siteFilter]);

  // ---------------------------------------------------------------------------
  // maxPct for bar chart (relative to top row)
  // ---------------------------------------------------------------------------
  const maxWorkMinutes = sortedRows.length > 0 ? sortedRows[0].workMinutes : 1;

  // ---------------------------------------------------------------------------
  // Excel export
  // ---------------------------------------------------------------------------
  function handleExport() {
    const leaderboardRows = sortedRows.map((r) => ({
      rank: r.rank,
      name: r.name,
      site: r.site,
      totalMinutes: r.workMinutes,
      dayCount: r.dayCount,
    }));
    const yearNum = yearFilter && yearFilter !== "all" ? parseInt(yearFilter) : undefined;
    exportWeekendLeaderboardExcel(leaderboardRows, yearNum);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const hasData = yearRecords.length > 0;

  return (
    <div className="space-y-4">
      {/* Top 4 stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <WeekendStatCard label="총 인원" value={stats.totalPeople} icon="👥" />
        <WeekendStatCard label="주말 출근일수" value={stats.totalDays} icon="📅" />
        <WeekendStatCard label="누적 근무시간" value={fmtMin(stats.totalMinutes)} icon="⏱" />
        <WeekendStatCard label="1인 평균" value={fmtMin(stats.avgMinutes)} icon="📊" />
      </div>

      {/* Site stats row */}
      {siteStats.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {siteStats.map((s) => {
            const badge = getSiteBadge(s.site);
            return (
              <div
                key={s.site ?? "__unassigned__"}
                className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 shadow-sm border border-border text-sm"
              >
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}>
                  {badge.label}
                </span>
                <span className="text-muted-foreground">{s.count}명</span>
                <span className="font-semibold tabular-nums">{fmtMin(s.totalMinutes)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="이름 또는 직급 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Site filter */}
        <select
          className="text-sm border border-border rounded-md bg-background px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
          value={siteFilter}
          onChange={(e) => setSiteFilter(e.target.value)}
        >
          <option value="all">전체 현장</option>
          {allSites.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
          <option value="미지정">미지정</option>
        </select>

        {/* Excel export */}
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
        >
          <Download className="w-4 h-4" />
          엑셀
        </button>

        {/* Count display */}
        <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
          {filteredRows.length} / {sortedRows.length}명
        </span>
      </div>

      {/* Table */}
      {!hasData ? (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-4xl mb-3">📭</div>
          <div className="font-medium">데이터가 없습니다</div>
          <div className="text-sm mt-1">주말 근무 기록을 업로드해 주세요.</div>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-4xl mb-3">🔍</div>
          <div className="font-medium">검색 결과가 없습니다</div>
          <div className="text-sm mt-1">검색어 또는 현장 필터를 조정해 보세요.</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                <th className="px-3 py-2 text-right w-8">#</th>
                <th className="px-3 py-2 text-left">이름</th>
                <th className="px-3 py-2 text-left">직급</th>
                <th className="px-3 py-2 text-left">현장</th>
                <th className="px-3 py-2 text-right">근무일</th>
                <th className="px-3 py-2 text-right">체류</th>
                <th className="px-3 py-2 text-right">근무시간</th>
                <th className="px-3 py-2 text-right">점유율(%)</th>
                <th className="px-3 py-2 text-left w-28">분포</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRows.map((row) => {
                const badge = getSiteBadge(row.site);
                const pct = maxWorkMinutes > 0 ? Math.round((row.workMinutes / maxWorkMinutes) * 100) : 0;
                const totalAllMinutes = stats.totalMinutes > 0 ? Math.round((row.workMinutes / stats.totalMinutes) * 100) : 0;

                return (
                  <tr
                    key={row.name}
                    className="hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => onSelectPerson(row.name)}
                  >
                    {/* # */}
                    <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{row.rank}</td>

                    {/* 이름 */}
                    <td className="px-3 py-2 font-medium">
                      {row.name}
                      {row.hasWarnings && (
                        <span className="ml-1 text-amber-500" title="경고 있음">⚠️</span>
                      )}
                    </td>

                    {/* 직급 */}
                    <td className="px-3 py-2 text-muted-foreground">{row.position}</td>

                    {/* 현장 badge */}
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>

                    {/* 근무일 */}
                    <td className="px-3 py-2 text-right tabular-nums">{row.dayCount}</td>

                    {/* 체류 */}
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {fmtMin(row.stayMinutes)}
                    </td>

                    {/* 근무시간 */}
                    <td className="px-3 py-2 text-right tabular-nums font-bold">
                      {fmtMin(row.workMinutes)}
                    </td>

                    {/* 점유율 */}
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {totalAllMinutes}%
                    </td>

                    {/* 분포 bar */}
                    <td className="px-3 py-2">
                      <div className="h-2 bg-muted rounded-full overflow-hidden w-24">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
