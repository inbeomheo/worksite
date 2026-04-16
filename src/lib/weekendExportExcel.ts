import * as XLSX from "xlsx";
import { getDow, weekKey, reportPeriodRange, reportPeriodLabel, fmtClock } from "./weekendCalc";
import type { WkRecord, WkSite, WkEmployee, WkMonthlyReport, WkReportConfig } from "./weekendTypes";

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
    const department = siteObj?.department || defaultDepartment;

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

// ---------------------------------------------------------------------------
// 직급 정렬 순서
// ---------------------------------------------------------------------------
const POSITION_ORDER: Record<string, number> = {
  이사: 0, 부사장: 1, 상무: 2, 전무: 3,
  부장: 10, 차장: 20, 과장: 30,
  수석: 40, 책임: 50,
  선임2: 60, 대리: 60,
  선임1: 70, 주임: 70,
  사원: 80,
};

function posOrder(pos: string): number {
  return POSITION_ORDER[pos] ?? 90;
}

// ---------------------------------------------------------------------------
// 근로인정 시간 계산: min(floor(workMinutes → 정시), 480분=8시간)
// ---------------------------------------------------------------------------
function recognizedMinutes(workMins: number): number {
  if (workMins <= 0) return 0;
  const floored = Math.floor(workMins / 60) * 60; // 정시 기준 내림
  return Math.min(floored, 480);
}

// ---------------------------------------------------------------------------
// Public: 원본 엑셀 양식대로 내보내기 (근무시간 확인 + 보고서 첨부)
// ---------------------------------------------------------------------------
export function exportWeekendFullExcel(
  periodKey: string,
  records: Record<string, WkRecord>,
  employees: Record<string, WkEmployee>,
  sites: Record<string, WkSite>,
  defaultDepartment: string
): void {
  const { start, end } = reportPeriodRange(periodKey);
  const periodLabel = `${start.slice(2).replace(/-/g, ".")} ~ ${end.slice(2).replace(/-/g, ".")}`;

  // 기간 내 레코드 필터
  const periodRecords = Object.values(records).filter(
    (r) => r.date >= start && r.date <= end
  );

  // 모든 직원 목록 (이 기간에 한 번이라도 등장한 사람)
  const allNames = new Set<string>();
  for (const r of periodRecords) allNames.add(r.name);
  // 직급순 → 이름순 정렬
  const sortedNames = Array.from(allNames).sort((a, b) => {
    const posA = posOrder(employees[a]?.position ?? "");
    const posB = posOrder(employees[b]?.position ?? "");
    if (posA !== posB) return posA - posB;
    return a.localeCompare(b);
  });

  // 주차별 그룹
  const weekDates = new Map<string, Set<string>>(); // weekStart → dates
  for (const r of periodRecords) {
    const wk = weekKey(r.date);
    if (!weekDates.has(wk)) weekDates.set(wk, new Set());
    weekDates.get(wk)!.add(r.date);
  }
  const weeks = Array.from(weekDates.keys()).sort();

  // 각 주의 대표 날짜 (토요일) = 그 주의 첫 번째 날짜
  const weekRepDate = new Map<string, string>();
  for (const wk of weeks) {
    const dates = Array.from(weekDates.get(wk)!).sort();
    weekRepDate.set(wk, dates[0]);
  }

  // 레코드 lookup: date+name → record
  const recMap = new Map<string, WkRecord>();
  for (const r of periodRecords) {
    recMap.set(`${r.date}__${r.name}`, r);
  }

  // 누적 데이터 계산
  const cumulative = new Map<string, { totalMins: number; recognizedMins: number }>();
  for (const name of sortedNames) {
    let totalMins = 0;
    let totalRecog = 0;
    for (const r of periodRecords) {
      if (r.name !== name) continue;
      totalMins += r.workMinutes;
      totalRecog += recognizedMinutes(r.workMinutes);
    }
    cumulative.set(name, { totalMins, recognizedMins: totalRecog });
  }

  // 수당 계산: 시간당 12,500원, 시간 미만 버림, 상한 200,000원
  function calcAllowance(recognizedMins: number): number {
    const hours = Math.floor(recognizedMins / 60);
    return Math.min(200000, hours * 12500);
  }

  // ═════════════════════════════════════════════
  // Sheet 1: 근무시간 확인
  // ═════════════════════════════════════════════
  const aoa1: (string | number)[][] = [];

  // 헤더
  aoa1.push([
    "날짜", "직급", "이름", "출근시간", "퇴근시간",
    "휴게시간", "근무시간", "근로인정",
    "", // 구분
    "직급", "이름", `${periodLabel}\n누적 근무시간`, "수당",
  ]);

  let isFirstWeek = true;

  for (const wk of weeks) {
    const dates = Array.from(weekDates.get(wk)!).sort();
    const repDate = weekRepDate.get(wk)!;

    for (let ni = 0; ni < sortedNames.length; ni++) {
      const name = sortedNames[ni];
      const emp = employees[name];
      const position = emp?.position ?? "";

      // 이 직원이 이 주에 근무한 레코드 찾기 (여러 날 가능)
      let dayRec: WkRecord | null = null;
      for (const d of dates) {
        const r = recMap.get(`${d}__${name}`);
        if (r) { dayRec = r; break; }
      }

      // 왼쪽 영역
      const dateCell = ni === 0 ? repDate : "";
      let checkInStr = "휴무";
      let checkOutStr = "휴무";
      let breakStr = "";
      let workStr = "";
      let recogStr = "";

      if (dayRec && dayRec.checkIn) {
        const ci = new Date(dayRec.checkIn);
        checkInStr = fmtClock(ci);

        if (dayRec.checkOut) {
          const co = new Date(dayRec.checkOut);
          checkOutStr = fmtClock(co);
        } else {
          checkOutStr = "미타각";
        }

        if (dayRec.lunchMinutes > 0) {
          const bh = Math.floor(dayRec.lunchMinutes / 60);
          const bm = dayRec.lunchMinutes % 60;
          breakStr = `${bh}:${String(bm).padStart(2, "0")}`;
        }

        if (dayRec.workMinutes > 0) {
          const wh = Math.floor(dayRec.workMinutes / 60);
          const wm = dayRec.workMinutes % 60;
          workStr = `${wh}:${String(wm).padStart(2, "0")}`;
        }

        const recogMins = recognizedMinutes(dayRec.workMinutes);
        if (recogMins > 0) {
          const rh = Math.floor(recogMins / 60);
          const rm = recogMins % 60;
          recogStr = `${rh}:${String(rm).padStart(2, "0")}`;
        }
      }

      // 오른쪽 영역 (첫 주차에만)
      let rPos = "", rName = "", rCumHours: string | number = "", rAllow: string | number = "";
      if (isFirstWeek) {
        rPos = position;
        rName = name;
        const cum = cumulative.get(name);
        if (cum) {
          const h = Math.round(cum.recognizedMins / 60 * 100) / 100;
          rCumHours = h;
          const allowance = calcAllowance(cum.recognizedMins);
          rAllow = allowance;
        }
      }

      aoa1.push([
        dateCell, position, name,
        checkInStr, checkOutStr, breakStr, workStr, recogStr,
        "", // separator
        rPos, rName, rCumHours, rAllow,
      ]);
    }

    // 소계 행
    let weekWorkTotal = 0;
    let weekRecogTotal = 0;
    for (const name of sortedNames) {
      for (const d of dates) {
        const r = recMap.get(`${d}__${name}`);
        if (r) {
          weekWorkTotal += r.workMinutes;
          weekRecogTotal += recognizedMinutes(r.workMinutes);
        }
      }
    }

    const siteName = Object.keys(sites)[0] ?? "파트";
    const wkWorkH = Math.round(weekWorkTotal / 60 * 100) / 100;
    const wkRecogH = Math.round(weekRecogTotal / 60 * 100) / 100;

    const subtotalRow: (string | number)[] = [
      "", `${siteName} 근무시간 합계`, "", "", "", "",
      wkWorkH, wkRecogH,
      "",
    ];

    if (isFirstWeek) {
      const grandRecog = Array.from(cumulative.values()).reduce((s, c) => s + c.recognizedMins, 0);
      const grandAllow = Array.from(cumulative.values()).reduce((s, c) => {
        return s + calcAllowance(c.recognizedMins);
      }, 0);
      subtotalRow.push(
        "누적 합계", "",
        Math.round(grandRecog / 60 * 100) / 100,
        grandAllow
      );
    }

    aoa1.push(subtotalRow);
    isFirstWeek = false;
  }

  const ws1 = XLSX.utils.aoa_to_sheet(aoa1);
  ws1["!cols"] = [
    { wch: 12 }, // 날짜
    { wch: 8 },  // 직급
    { wch: 8 },  // 이름
    { wch: 8 },  // 출근
    { wch: 8 },  // 퇴근
    { wch: 8 },  // 휴게
    { wch: 8 },  // 근무
    { wch: 8 },  // 근로인정
    { wch: 2 },  // 구분
    { wch: 8 },  // 직급
    { wch: 8 },  // 이름
    { wch: 18 }, // 누적
    { wch: 10 }, // 수당
  ];

  // ═════════════════════════════════════════════
  // Sheet 2: 보고서 첨부
  // ═════════════════════════════════════════════
  const reportRows = buildReportRows(periodKey, records, employees, sites, defaultDepartment);

  const aoa2: (string | number)[][] = [];
  aoa2.push(["부서", "팀/파트", "근무일", "요일", "근무인원", "총근무시간", "비고"]);

  for (const row of reportRows) {
    aoa2.push([
      row.department, row.site, row.date, row.dow,
      row.headcount, row.paidHours, "",
    ]);
  }

  const ws2 = XLSX.utils.aoa_to_sheet(aoa2);
  ws2["!cols"] = [
    { wch: 14 }, { wch: 18 }, { wch: 12 },
    { wch: 6 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
  ];

  // ═════════════════════════════════════════════
  // Workbook 생성
  // ═════════════════════════════════════════════
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, "근무시간 확인");
  XLSX.utils.book_append_sheet(wb, ws2, "보고서 첨부");
  XLSX.writeFile(wb, `주말근무_누적관리_${periodKey}_${todayStr()}.xlsx`);
}
