import * as XLSX from "xlsx";
import { getDow, reportPeriodRange, reportPeriodLabel } from "./weekendCalc";
import type { WkRecord, WkSite, WkMonthlyReport, WkReportConfig } from "./weekendTypes";

// ---------------------------------------------------------------------------
// Local interface (not exported from types)
// ---------------------------------------------------------------------------
interface ReportRow {
  department: string;
  site: string;
  date: string;
  dow: string;
  headcount: number;
  paidHours: number;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// ---------------------------------------------------------------------------
// Public: aggregate records within period into report rows
// ---------------------------------------------------------------------------
export function buildReportRows(
  periodKey: string,
  records: Record<string, WkRecord>,
  employees: Record<string, { site: string | null }>,
  sites: Record<string, WkSite>,
  defaultDepartment: string
): ReportRow[] {
  const { start, end } = reportPeriodRange(periodKey);

  // Aggregate by site+date
  const agg = new Map<string, { department: string; site: string; date: string; names: Set<string>; minutes: number }>();

  for (const rec of Object.values(records)) {
    if (rec.date < start || rec.date > end) continue;
    if (rec.workMinutes <= 0) continue;

    const siteName = rec.site ?? "";
    const siteObj = siteName ? sites[siteName] : null;
    const department = siteObj?.department ?? defaultDepartment;

    const aggKey = `${siteName}__${rec.date}`;
    if (!agg.has(aggKey)) {
      agg.set(aggKey, { department, site: siteName, date: rec.date, names: new Set(), minutes: 0 });
    }
    const entry = agg.get(aggKey)!;
    entry.names.add(rec.name);
    entry.minutes += rec.workMinutes;
  }

  const rows: ReportRow[] = [];
  for (const entry of agg.values()) {
    rows.push({
      department: entry.department,
      site: entry.site,
      date: entry.date,
      dow: getDow(entry.date),
      headcount: entry.names.size,
      paidHours: Math.floor(entry.minutes / 60),
    });
  }

  // Sort: department → site → date
  rows.sort((a, b) => {
    if (a.department !== b.department) return a.department.localeCompare(b.department);
    if (a.site !== b.site) return a.site.localeCompare(b.site);
    return a.date.localeCompare(b.date);
  });

  return rows;
}

// ---------------------------------------------------------------------------
// Public: export report excel
// ---------------------------------------------------------------------------
export function exportWeekendReportExcel(
  periodKey: string,
  reportRows: ReportRow[],
  report: WkMonthlyReport,
  reportConfig: WkReportConfig
): void {
  const title = reportPeriodLabel(periodKey);
  const aoa: (string | number)[][] = [];

  // Title row
  aoa.push([title]);
  aoa.push([]); // blank

  // Table header
  aoa.push(["부서", "현장", "날짜", "요일", "인원(명)", "유급시간(H)"]);

  // Data rows
  for (const row of reportRows) {
    aoa.push([row.department, row.site, row.date, row.dow, row.headcount, row.paidHours]);
  }

  // Totals
  const totalHeadcount = reportRows.reduce((s, r) => s + r.headcount, 0);
  const totalHours = reportRows.reduce((s, r) => s + r.paidHours, 0);
  aoa.push(["합계", "", "", "", totalHeadcount, totalHours]);

  aoa.push([]); // blank

  // Notes section
  if (report.notes) {
    aoa.push(["[비고]"]);
    for (const line of report.notes.split("\n")) {
      aoa.push([line]);
    }
    aoa.push([]);
  }

  // Attachments
  if (report.attachmentCount > 0) {
    aoa.push([`첨부: ${report.attachmentCount}건`]);
    aoa.push([]);
  }

  // Approval line
  if (reportConfig.approvalLine) {
    aoa.push(["결재"]);
    for (const line of reportConfig.approvalLine.split("\n")) {
      aoa.push([line]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths
  ws["!cols"] = [
    { wch: 14 }, // 부서
    { wch: 16 }, // 현장
    { wch: 12 }, // 날짜
    { wch: 6 },  // 요일
    { wch: 10 }, // 인원
    { wch: 12 }, // 유급시간
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "주말근무현황");
  XLSX.writeFile(wb, `주말근무현황_${periodKey}_${todayStr()}.xlsx`);
}

// ---------------------------------------------------------------------------
// Public: export leaderboard excel
// ---------------------------------------------------------------------------
export function exportWeekendLeaderboardExcel(
  leaderboardRows: { rank: number; name: string; site: string | null; totalMinutes: number; dayCount: number }[],
  yearFilter?: number
): void {
  const aoa: (string | number | null)[][] = [];

  const yearLabel = yearFilter ? `${yearFilter}년 ` : "";
  aoa.push([`${yearLabel}주말근무 현황 순위`]);
  aoa.push([]);
  aoa.push(["순위", "성명", "현장", "총 유급시간(H)", "근무일수"]);

  for (const row of leaderboardRows) {
    aoa.push([
      row.rank,
      row.name,
      row.site ?? "-",
      Math.floor(row.totalMinutes / 60),
      row.dayCount,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 6 },  // 순위
    { wch: 10 }, // 성명
    { wch: 14 }, // 현장
    { wch: 14 }, // 유급시간
    { wch: 8 },  // 근무일수
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "주말근무순위");
  XLSX.writeFile(wb, `주말근무순위_${yearFilter ?? "전체"}_${todayStr()}.xlsx`);
}
