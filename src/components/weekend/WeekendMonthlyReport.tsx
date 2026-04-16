import { useState, useMemo, useRef, useCallback } from "react";
import { Copy, Check, Save } from "lucide-react";
import {
  reportPeriodRange,
  currentReportPeriodKey,
  getDow,
} from "@/lib/weekendCalc";
import type { WkState, WkMonthlyReport, WkReportConfig, WkRecord, WkSite } from "@/lib/weekendTypes";
import { toast } from "sonner";

interface Props {
  state: WkState;
  onSaveReport: (periodKey: string, report: WkMonthlyReport) => void;
  onSaveConfig: (config: WkReportConfig) => void;
}

// ── Period key from record date ──
function dateToPeriodKey(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (d >= 16) {
    const nm = m + 1;
    if (nm > 12) return `${y + 1}-01`;
    return `${y}-${String(nm).padStart(2, "0")}`;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

// ── Report row ──
interface ReportRow {
  department: string;
  site: string;
  date: string;      // MM/DD
  fullDate: string;   // YYYY-MM-DD
  dow: string;
  headcount: number;
  paidHours: number;
  note: string;
}

function buildRows(
  periodKey: string,
  records: Record<string, WkRecord>,
  sites: Record<string, WkSite>,
  defaultDepartment: string
): ReportRow[] {
  const { start, end } = reportPeriodRange(periodKey);
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
    const [, m, d] = entry.date.split("-");
    rows.push({
      department: entry.department,
      site: entry.site,
      date: `${m}/${d}`,
      fullDate: entry.date,
      dow: getDow(entry.date),
      headcount: entry.names.size,
      paidHours: Math.floor(entry.minutes / 60),
      note: "",
    });
  }
  rows.sort((a, b) => {
    if (a.department !== b.department) return a.department.localeCompare(b.department);
    if (a.site !== b.site) return a.site.localeCompare(b.site);
    return a.fullDate.localeCompare(b.fullDate);
  });
  return rows;
}

// ── Period label ──
function periodTitle(periodKey: string): string {
  const { start, end } = reportPeriodRange(periodKey);
  const [, sm, sd] = start.split("-").map(Number);
  const [, em, ed] = end.split("-").map(Number);
  return `${sm}~${em}월 주말근무현황 (${sm}월 ${sd}일 ~ ${em}월 ${ed}일)`;
}

// ── HTML 생성 ──
function generateHTML(
  rows: ReportRow[],
  periodKey: string,
  sitePart: string,
  notes: string,
  attachments: string
): string {
  const title = periodTitle(periodKey);
  const p = (text: string) =>
    `<p style="font-family:'맑은 고딕';font-size:9pt;color:rgb(0, 0, 0);margin-top:0px;margin-bottom:0px;line-height:1.5;">${text}</p>`;

  const thStyle = `font-family:'맑은 고딕', monospace;color:white;font-size:10pt;font-weight:700;text-align:center;background:rgb(23, 55, 94);`;
  const thBorderFirst = `border-width:1px 1px 3px;border-style:solid solid double;border-color:rgb(0, 0, 0);`;
  const thBorderRest = `border-width:1px 1px 3px medium;border-style:solid solid double none;border-color:rgb(0, 0, 0) rgb(0, 0, 0) rgb(0, 0, 0) currentcolor;`;
  const tdBase = `font-family:'맑은 고딕', monospace;color:black;font-size:10pt;text-align:center;`;
  const tdDotted = `border-width:medium 1px 1px medium;border-style:none solid dotted none;border-color:currentcolor rgb(0, 0, 0) rgb(0, 0, 0) currentcolor;`;
  const tdSolid = `border-width:medium 1px 1px medium;border-style:none solid solid none;border-color:currentcolor rgb(0, 0, 0) rgb(0, 0, 0) currentcolor;`;
  const tdSpan = `border-width:medium 1px 1px;border-style:none solid solid;border-color:currentcolor rgb(0, 0, 0) rgb(0, 0, 0);`;

  const cell = (text: string) =>
    `<p style="font-family:'맑은 고딕', monospace;font-size:10pt;color:inherit;text-align:center;margin-top:0px;margin-bottom:0px;line-height:1.5;">${text}</p>`;

  // Group by dept+site for rowspan
  const groups: { dept: string; site: string; rows: ReportRow[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.dept === row.department && last.site === row.site) {
      last.rows.push(row);
    } else {
      groups.push({ dept: row.department, site: row.site, rows: [row] });
    }
  }

  let tableRows = "";
  for (const g of groups) {
    const n = g.rows.length;
    g.rows.forEach((row, i) => {
      const isLast = i === n - 1;
      const borderStyle = isLast ? tdSolid : tdDotted;
      let tr = "<tr>";

      if (i === 0) {
        tr += `<td rowspan="${n}" style="${tdBase}${tdSpan}height:${n * 22}px;">${cell(g.dept)}</td>`;
        tr += `<td rowspan="${n}" style="${tdBase}${tdSpan}white-space-collapse:collapse;">${cell(g.site || "-")}</td>`;
      }

      tr += `<td style="${tdBase}${borderStyle}">${cell(row.date)}</td>`;
      tr += `<td style="${tdBase}${borderStyle}">${cell(row.dow)}</td>`;
      tr += `<td style="${tdBase}${borderStyle}">${cell(String(row.headcount))}</td>`;
      tr += `<td style="${tdBase}${borderStyle}">${cell(String(row.paidHours))}</td>`;
      tr += `<td style="${tdBase}${borderStyle}">${cell(row.note || "<br />")}</td>`;
      tr += "</tr>";
      tableRows += tr;
    });
  }

  const headers = ["부서", "팀/파트", "근무일", "요일", "근무인원", "총근무시간", "비고"];
  const colWidths = [71, 77, 51, 39, 64, 78, 93];

  const colgroup = colWidths.map((w) => `<col style="width:${w}px;" />`).join("");
  const totalWidth = colWidths.reduce((s, w) => s + w, 0);

  const headerRow = headers
    .map(
      (h, i) =>
        `<td style="${thStyle}${i === 0 ? thBorderFirst : thBorderRest}">${cell(h)}</td>`
    )
    .join("");

  const table = `<table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:${totalWidth}px;margin-left:40px;table-layout:fixed;overflow-wrap:break-word;word-break:normal;">
<colgroup>${colgroup}</colgroup>
<tbody>
<tr style="height:31px;">${headerRow}</tr>
${tableRows}
</tbody>
</table>`;

  const notesLines = notes
    .split("\n")
    .map((line) => p(`&nbsp; &nbsp; &nbsp;${line}`))
    .join("\n");

  const attachLines = attachments
    .split("\n")
    .map((line) => p(`&nbsp; &nbsp; &nbsp;${line}`))
    .join("\n");

  return [
    p("<br />"),
    p(`&nbsp;가. ${title}<br /><br />`),
    table,
    p("<br />"),
    p("<br />"),
    p("&nbsp;나. 특이사항"),
    notesLines,
    p("<br />"),
    p("<br />"),
    p("&nbsp;다. 첨부"),
    attachLines,
  ].join("\n");
}

// ═══════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════
export default function WeekendMonthlyReport({ state, onSaveReport, onSaveConfig }: Props) {
  const { records, sites, monthlyReports, reportConfig } = state;

  // ── Available periods ──
  const availablePeriods = useMemo(() => {
    const set = new Set<string>();
    set.add(currentReportPeriodKey());
    for (const rec of Object.values(records)) {
      set.add(dateToPeriodKey(rec.date));
    }
    return Array.from(set).sort().reverse();
  }, [records]);

  const [periodKey, setPeriodKey] = useState<string>(() => {
    // 데이터가 있는 기간 자동 선택
    const counts = new Map<string, number>();
    for (const rec of Object.values(records)) {
      const pk = dateToPeriodKey(rec.date);
      counts.set(pk, (counts.get(pk) ?? 0) + 1);
    }
    if (counts.size > 0) {
      return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
    }
    return currentReportPeriodKey();
  });

  const saved = monthlyReports[periodKey];
  const [notes, setNotes] = useState(saved?.notes ?? "P4 그린동 현장 작업으로 인한 주말 근무");
  const [attachments, setAttachments] = useState("1) 주말근무신청서 4부.");
  const [defaultDepartment, setDefaultDepartment] = useState(reportConfig.defaultDepartment || "사업1본부");
  const [sitePart, setSitePart] = useState("그린동파트\n(P4 그린동)");
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // ── Build rows ──
  const reportRows = useMemo(
    () => buildRows(periodKey, records, sites, defaultDepartment),
    [periodKey, records, sites, defaultDepartment]
  );

  // ── Apply sitePart override ──
  const displayRows = useMemo(() => {
    return reportRows.map((r) => ({
      ...r,
      site: sitePart.replace(/\n/g, "<br />"),
    }));
  }, [reportRows, sitePart]);

  // ── Generate HTML ──
  const html = useMemo(
    () => generateHTML(displayRows, periodKey, sitePart, notes, attachments),
    [displayRows, periodKey, sitePart, notes, attachments]
  );

  // ── Copy HTML ──
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([html], { type: "text/plain" }),
        }),
      ]);
      setCopied(true);
      toast.success("HTML 복사 완료 — 메일/게시판에 붙여넣기하세요");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: text only
      await navigator.clipboard.writeText(html);
      setCopied(true);
      toast.success("코드 복사 완료");
      setTimeout(() => setCopied(false), 2000);
    }
  }, [html]);

  // ── Save ──
  const handleSave = useCallback(() => {
    const report: WkMonthlyReport = {
      notes,
      attachmentCount: 1,
      updatedAt: new Date().toISOString(),
    };
    onSaveReport(periodKey, report);
    onSaveConfig({
      defaultDepartment,
      approvalLine: reportConfig.approvalLine,
    });
    toast.success("저장 완료");
  }, [periodKey, notes, defaultDepartment, reportConfig.approvalLine, onSaveReport, onSaveConfig]);

  // ── Period change ──
  function handlePeriodChange(key: string) {
    setPeriodKey(key);
    const s = monthlyReports[key];
    if (s?.notes) setNotes(s.notes);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="text-sm border border-border rounded-md bg-background px-2 py-1.5"
          value={periodKey}
          onChange={(e) => handlePeriodChange(e.target.value)}
        >
          {availablePeriods.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>

        <div className="flex-1" />

        <button
          onClick={handleSave}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Save className="w-4 h-4" />
          저장
        </button>

        <button
          onClick={() => setShowCode(!showCode)}
          className="text-sm px-3 py-1.5 rounded-md bg-slate-600 hover:bg-slate-700 text-white"
        >
          {showCode ? "미리보기" : "코드보기"}
        </button>

        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? "복사됨" : "HTML 복사"}
        </button>
      </div>

      {/* 설정 패널 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-muted/30 border border-border rounded-lg p-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">부서명</span>
          <input
            type="text"
            value={defaultDepartment}
            onChange={(e) => setDefaultDepartment(e.target.value)}
            className="border border-border rounded px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">팀/파트</span>
          <textarea
            value={sitePart}
            onChange={(e) => setSitePart(e.target.value)}
            rows={2}
            className="border border-border rounded px-2 py-1 text-sm resize-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">특이사항</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="border border-border rounded px-2 py-1 text-sm resize-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">첨부</span>
          <textarea
            value={attachments}
            onChange={(e) => setAttachments(e.target.value)}
            rows={2}
            className="border border-border rounded px-2 py-1 text-sm resize-none"
          />
        </label>
      </div>

      {/* Preview or Code */}
      {showCode ? (
        <div className="relative">
          <pre className="bg-slate-900 text-slate-200 text-xs p-4 rounded-lg overflow-auto max-h-[500px] whitespace-pre-wrap break-all">
            {html}
          </pre>
        </div>
      ) : (
        <div
          ref={previewRef}
          className="bg-white border border-border rounded-lg p-6 shadow-sm overflow-auto"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}
