import { useState, useMemo } from "react";
import { Printer, Download, Save } from "lucide-react";
import {
  reportPeriodRange,
  reportPeriodLabel,
  currentReportPeriodKey,
  fmtMin,
} from "@/lib/weekendCalc";
import {
  buildReportRows,
  exportWeekendReportExcel,
} from "@/lib/weekendExportExcel";
import type { WkState, WkMonthlyReport, WkReportConfig } from "@/lib/weekendTypes";

interface Props {
  state: WkState;
  onSaveReport: (periodKey: string, report: WkMonthlyReport) => void;
  onSaveConfig: (config: WkReportConfig) => void;
}

// ---------------------------------------------------------------------------
// Period key for a record date (day >= 16 → next month)
// ---------------------------------------------------------------------------
function dateToPeriodKey(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (d >= 16) {
    const nm = m + 1;
    if (nm > 12) return `${y + 1}-01`;
    return `${y}-${String(nm).padStart(2, "0")}`;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

export default function WeekendMonthlyReport({ state, onSaveReport, onSaveConfig }: Props) {
  const { records, employees, sites, monthlyReports, reportConfig } = state;

  const [periodKey, setPeriodKey] = useState<string>(currentReportPeriodKey);
  const [notes, setNotes] = useState<string>(monthlyReports[currentReportPeriodKey()]?.notes ?? "");
  const [attachmentCount, setAttachmentCount] = useState<number>(
    monthlyReports[currentReportPeriodKey()]?.attachmentCount ?? 1
  );

  // Approval line local state (wk-no-print)
  const [approvalLine, setApprovalLine] = useState<string>(reportConfig.approvalLine ?? "");
  const [defaultDepartment, setDefaultDepartment] = useState<string>(
    reportConfig.defaultDepartment ?? ""
  );

  // -----------------------------------------------------------------------
  // Available periods derived from records
  // -----------------------------------------------------------------------
  const availablePeriods = useMemo(() => {
    const set = new Set<string>();
    set.add(currentReportPeriodKey());
    for (const rec of Object.values(records)) {
      set.add(dateToPeriodKey(rec.date));
    }
    return Array.from(set).sort().reverse();
  }, [records]);

  // -----------------------------------------------------------------------
  // When period changes, load saved notes/attachmentCount
  // -----------------------------------------------------------------------
  function handlePeriodChange(key: string) {
    setPeriodKey(key);
    const saved = monthlyReports[key];
    setNotes(saved?.notes ?? "");
    setAttachmentCount(saved?.attachmentCount ?? 1);
  }

  // -----------------------------------------------------------------------
  // Report rows for current period
  // -----------------------------------------------------------------------
  const reportRows = useMemo(
    () =>
      buildReportRows(
        periodKey,
        records,
        employees,
        sites,
        defaultDepartment || reportConfig.defaultDepartment
      ),
    [periodKey, records, employees, sites, defaultDepartment, reportConfig.defaultDepartment]
  );

  // -----------------------------------------------------------------------
  // Row span computation for department and site columns
  // -----------------------------------------------------------------------
  const rowSpans = useMemo(() => {
    const dept: number[] = new Array(reportRows.length).fill(0);
    const site: number[] = new Array(reportRows.length).fill(0);

    let i = 0;
    while (i < reportRows.length) {
      let dj = i + 1;
      while (dj < reportRows.length && reportRows[dj].department === reportRows[i].department) dj++;
      dept[i] = dj - i;
      // Within the same dept block, compute site spans
      let sk = i;
      while (sk < dj) {
        let sl = sk + 1;
        while (
          sl < dj &&
          reportRows[sl].site === reportRows[sk].site
        ) sl++;
        site[sk] = sl - sk;
        sk = sl;
      }
      i = dj;
    }
    return { dept, site };
  }, [reportRows]);

  // -----------------------------------------------------------------------
  // Totals
  // -----------------------------------------------------------------------
  const totals = useMemo(() => {
    const headcount = reportRows.reduce((s, r) => s + r.headcount, 0);
    const paidHours = reportRows.reduce((s, r) => s + r.paidHours, 0);
    return { headcount, paidHours };
  }, [reportRows]);

  // -----------------------------------------------------------------------
  // Print
  // -----------------------------------------------------------------------
  function handlePrint() {
    document.body.classList.add("wk-print-report");
    window.print();
    document.body.classList.remove("wk-print-report");
  }

  // -----------------------------------------------------------------------
  // Excel export
  // -----------------------------------------------------------------------
  function handleExcel() {
    const report: WkMonthlyReport = {
      notes,
      attachmentCount,
      updatedAt: new Date().toISOString(),
    };
    exportWeekendReportExcel(periodKey, reportRows, report, {
      defaultDepartment: defaultDepartment || reportConfig.defaultDepartment,
      approvalLine: approvalLine || reportConfig.approvalLine,
    });
  }

  // -----------------------------------------------------------------------
  // Save
  // -----------------------------------------------------------------------
  function handleSave() {
    const report: WkMonthlyReport = {
      notes,
      attachmentCount,
      updatedAt: new Date().toISOString(),
    };
    onSaveReport(periodKey, report);
    onSaveConfig({
      defaultDepartment: defaultDepartment || reportConfig.defaultDepartment,
      approvalLine: approvalLine || reportConfig.approvalLine,
    });
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  const label = reportPeriodLabel(periodKey);

  return (
    <div className="space-y-4">
      {/* Toolbar (wk-no-print) */}
      <div className="wk-no-print flex flex-wrap items-center gap-2">
        {/* Period selector */}
        <select
          className="text-sm border border-border rounded-md bg-background px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
          value={periodKey}
          onChange={(e) => handlePeriodChange(e.target.value)}
        >
          {availablePeriods.map((k) => (
            <option key={k} value={k}>
              {k} ({reportPeriodLabel(k).split(" ")[1] ?? k})
            </option>
          ))}
        </select>

        <div className="flex-1" />

        {/* Save */}
        <button
          onClick={handleSave}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          <Save className="w-4 h-4" />
          저장
        </button>

        {/* Print */}
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-slate-600 hover:bg-slate-700 text-white transition-colors"
        >
          <Printer className="w-4 h-4" />
          인쇄
        </button>

        {/* Excel */}
        <button
          onClick={handleExcel}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
        >
          <Download className="w-4 h-4" />
          엑셀
        </button>
      </div>

      {/* Report document */}
      <div className="wk-report-doc bg-white text-black rounded-lg border border-border p-8 shadow-sm space-y-6 text-sm">
        {/* Title */}
        <h2 className="text-center text-xl font-bold tracking-wide">
          {label.match(/(\d+)월/)?.[1] ?? ""}월 주말근무 보고
        </h2>

        {/* 가. 현황 테이블 */}
        <section>
          <h3 className="font-bold mb-2">가. {label}</h3>
          {reportRows.length === 0 ? (
            <p className="text-muted-foreground text-xs">해당 기간 근무 기록이 없습니다.</p>
          ) : (
            <table className="wk-rpt-table w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-2 py-1 text-center">부서</th>
                  <th className="border border-gray-300 px-2 py-1 text-center">팀/파트</th>
                  <th className="border border-gray-300 px-2 py-1 text-center">근무일</th>
                  <th className="border border-gray-300 px-2 py-1 text-center">요일</th>
                  <th className="border border-gray-300 px-2 py-1 text-center">근무인원</th>
                  <th className="border border-gray-300 px-2 py-1 text-center">총근무시간(h)</th>
                  <th className="border border-gray-300 px-2 py-1 text-center">비고</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.map((row, idx) => (
                  <tr key={`${row.site}-${row.date}`}>
                    {/* 부서 (row span) */}
                    {rowSpans.dept[idx] > 0 && (
                      <td
                        className="border border-gray-300 px-2 py-1 text-center align-middle"
                        rowSpan={rowSpans.dept[idx]}
                      >
                        {row.department}
                      </td>
                    )}
                    {/* 팀/파트 (row span) */}
                    {rowSpans.site[idx] > 0 && (
                      <td
                        className="border border-gray-300 px-2 py-1 text-center align-middle"
                        rowSpan={rowSpans.site[idx]}
                      >
                        {row.site || "-"}
                      </td>
                    )}
                    <td className="border border-gray-300 px-2 py-1 text-center">{row.date}</td>
                    <td className="border border-gray-300 px-2 py-1 text-center">{row.dow}</td>
                    <td className="border border-gray-300 px-2 py-1 text-center tabular-nums">
                      {row.headcount}
                    </td>
                    <td className="border border-gray-300 px-2 py-1 text-center tabular-nums">
                      {row.paidHours}
                    </td>
                    <td className="border border-gray-300 px-2 py-1" />
                  </tr>
                ))}
                {/* Total row */}
                <tr className="font-bold bg-gray-50">
                  <td
                    className="border border-gray-300 px-2 py-1 text-center"
                    colSpan={4}
                  >
                    합계
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-center tabular-nums">
                    {totals.headcount}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-center tabular-nums">
                    {totals.paidHours}
                  </td>
                  <td className="border border-gray-300 px-2 py-1" />
                </tr>
              </tbody>
            </table>
          )}
        </section>

        {/* 나. 특이사항 */}
        <section>
          <h3 className="font-bold mb-2">나. 특이사항</h3>
          {/* Display div (print-visible) */}
          <div className="min-h-[48px] whitespace-pre-wrap text-xs border border-gray-200 rounded p-2">
            {notes || <span className="text-gray-400">없음</span>}
          </div>
          {/* Textarea (screen only) */}
          <textarea
            className="wk-no-print mt-2 w-full text-xs border border-border rounded p-2 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            rows={3}
            placeholder="특이사항을 입력하세요"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </section>

        {/* 다. 첨부 */}
        <section>
          <h3 className="font-bold mb-1">다. 첨부</h3>
          <p>
            주말근무신청서{" "}
            <span className="font-bold tabular-nums">{attachmentCount}</span>부. 끝.
          </p>
          {/* Attachment count input (screen only) */}
          <div className="wk-no-print mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <label>첨부 부수:</label>
            <input
              type="number"
              min={0}
              className="w-16 border border-border rounded px-2 py-0.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-ring"
              value={attachmentCount}
              onChange={(e) => setAttachmentCount(Math.max(0, parseInt(e.target.value) || 0))}
            />
          </div>
        </section>
      </div>

      {/* Approval line / config (wk-no-print) */}
      <div className="wk-no-print bg-muted/30 border border-border rounded-lg p-4 space-y-3 text-sm">
        <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
          보고서 설정
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">기본 부서명</span>
            <input
              type="text"
              className="border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
              placeholder={reportConfig.defaultDepartment || "예: 생산팀"}
              value={defaultDepartment}
              onChange={(e) => setDefaultDepartment(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">결재선</span>
            <textarea
              className="border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm resize-none"
              rows={2}
              placeholder={reportConfig.approvalLine || "예: 담당→팀장→부장"}
              value={approvalLine}
              onChange={(e) => setApprovalLine(e.target.value)}
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          * 저장 버튼을 누르면 위 설정이 함께 저장됩니다.
        </p>
      </div>
    </div>
  );
}
