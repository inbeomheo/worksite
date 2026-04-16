import { useMemo, useState } from "react";
import { fmtClock, weekKey, reportPeriodRange, currentReportPeriodKey } from "@/lib/weekendCalc";
import type { WkRecord, WkEmployee, WkSite } from "@/lib/weekendTypes";

interface Props {
  records: Record<string, WkRecord>;
  employees: Record<string, WkEmployee>;
  sites: Record<string, WkSite>;
  onEditRecord: (key: string, updates: Partial<WkRecord>) => void;
}

// ── 직급 정렬 ──
const POS: Record<string, number> = {
  이사: 0, 부사장: 1, 상무: 2, 전무: 3,
  부장: 10, 차장: 20, 과장: 30, 수석: 40, 책임: 50,
  선임2: 60, 대리: 60, 선임1: 70, 주임: 70, 사원: 80,
};

function posOrd(p: string) { return POS[p] ?? 90; }

// ── 근로인정: floor(시간) × 60, cap 480분 ──
function recognized(workMins: number): number {
  if (workMins <= 0) return 0;
  return Math.min(480, Math.floor(workMins / 60) * 60);
}

// ── 수당: floor(인정시간/60) × 12500, cap 200000 ──
function calcAllow(totalRecogMins: number): number {
  return Math.min(200000, Math.floor(totalRecogMins / 60) * 12500);
}

// ── 기간키 ──
function dateToPeriodKey(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (d >= 16) {
    const nm = m + 1;
    return nm > 12 ? `${y + 1}-01` : `${y}-${String(nm).padStart(2, "0")}`;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function fmtHM(mins: number): string {
  if (mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export default function WeekendHoursCheck({ records, employees, sites, onEditRecord }: Props) {
  // ── 기간 선택 ──
  const availablePeriods = useMemo(() => {
    const set = new Set<string>();
    set.add(currentReportPeriodKey());
    for (const rec of Object.values(records)) set.add(dateToPeriodKey(rec.date));
    return Array.from(set).sort().reverse();
  }, [records]);

  const [periodKey, setPeriodKey] = useState<string>(() => {
    const counts = new Map<string, number>();
    for (const rec of Object.values(records)) {
      const pk = dateToPeriodKey(rec.date);
      counts.set(pk, (counts.get(pk) ?? 0) + 1);
    }
    if (counts.size > 0) return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
    return currentReportPeriodKey();
  });

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editVal, setEditVal] = useState({ checkIn: "", checkOut: "" });

  // ── 기간 필터 ──
  const { start, end } = reportPeriodRange(periodKey);
  const periodLabel = `${start.slice(2).replace(/-/g, ".")} ~ ${end.slice(2).replace(/-/g, ".")}`;

  const periodRecords = useMemo(
    () => Object.values(records).filter((r) => r.date >= start && r.date <= end),
    [records, start, end]
  );

  // ── 주차별 그룹 ──
  const weeks = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const r of periodRecords) {
      const wk = weekKey(r.date);
      if (!map.has(wk)) map.set(wk, new Set());
      map.get(wk)!.add(r.date);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([wk, dates]) => ({ wk, dates: Array.from(dates).sort() }));
  }, [periodRecords]);

  // ── 모든 직원 (직급순) ──
  const allNames = useMemo(() => {
    const set = new Set<string>();
    for (const r of periodRecords) set.add(r.name);
    return Array.from(set).sort((a, b) => {
      const pa = posOrd(employees[a]?.position ?? "");
      const pb = posOrd(employees[b]?.position ?? "");
      return pa !== pb ? pa - pb : a.localeCompare(b);
    });
  }, [periodRecords, employees]);

  // ── 레코드 lookup ──
  const recMap = useMemo(() => {
    const m = new Map<string, WkRecord>();
    for (const r of periodRecords) m.set(`${r.date}__${r.name}`, r);
    return m;
  }, [periodRecords]);

  // ── 누적 ──
  const cumulative = useMemo(() => {
    const m = new Map<string, { workMins: number; recogMins: number }>();
    for (const name of allNames) {
      let w = 0, rg = 0;
      for (const r of periodRecords) {
        if (r.name !== name) continue;
        w += r.workMinutes;
        rg += recognized(r.workMinutes);
      }
      m.set(name, { workMins: w, recogMins: rg });
    }
    return m;
  }, [allNames, periodRecords]);

  // ── 편집 시작 ──
  function startEdit(rec: WkRecord) {
    setEditingKey(rec.key);
    setEditVal({
      checkIn: rec.checkIn ? fmtClock(new Date(rec.checkIn)) : "",
      checkOut: rec.checkOut ? fmtClock(new Date(rec.checkOut)) : "",
    });
  }

  function saveEdit(rec: WkRecord) {
    const parseHM = (hm: string, dateStr: string): string | null => {
      const m = hm.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      const d = new Date(`${dateStr}T${m[1].padStart(2, "0")}:${m[2]}:00`);
      return isNaN(d.getTime()) ? null : d.toISOString();
    };
    const ci = parseHM(editVal.checkIn, rec.date);
    const co = parseHM(editVal.checkOut, rec.date);
    onEditRecord(rec.key, { checkIn: ci, checkOut: co });
    setEditingKey(null);
  }

  if (periodRecords.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <div className="text-4xl mb-3">📋</div>
        <div className="font-medium">데이터가 없습니다</div>
      </div>
    );
  }

  const siteName = Object.keys(sites)[0] ?? "파트";

  return (
    <div className="space-y-4">
      {/* 기간 선택 */}
      <div className="flex items-center gap-3">
        <select
          value={periodKey}
          onChange={(e) => setPeriodKey(e.target.value)}
          className="text-sm border border-border rounded-md px-2 py-1.5"
        >
          {availablePeriods.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground">{periodLabel}</span>
        <span className="text-xs text-muted-foreground">셀 더블클릭으로 시간 수정</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr className="bg-slate-700 text-white">
              <th className="border border-slate-600 px-2 py-2 text-center font-bold w-[80px]">날짜</th>
              <th className="border border-slate-600 px-2 py-2 text-center font-bold w-[55px]">직급</th>
              <th className="border border-slate-600 px-2 py-2 text-center font-bold w-[60px]">이름</th>
              <th className="border border-slate-600 px-2 py-2 text-center font-bold w-[55px]">출근시간</th>
              <th className="border border-slate-600 px-2 py-2 text-center font-bold w-[55px]">퇴근시간</th>
              <th className="border border-slate-600 px-2 py-2 text-center font-bold w-[55px]">휴게시간</th>
              <th className="border border-slate-600 px-2 py-2 text-center font-bold w-[55px]">근무시간</th>
              <th className="border border-slate-600 px-2 py-2 text-center font-bold w-[55px]">근로인정</th>
              <th className="border border-slate-600 px-1 py-2 w-[8px]"></th>
              <th className="border border-slate-600 px-2 py-2 text-center font-bold w-[55px]">직급</th>
              <th className="border border-slate-600 px-2 py-2 text-center font-bold w-[60px]">이름</th>
              <th className="border border-slate-600 px-2 py-2 text-center font-bold w-[80px]">
                <div>{periodLabel}</div>
                <div>누적 근무시간</div>
              </th>
              <th className="border border-slate-600 px-2 py-2 text-center font-bold w-[65px]">수당</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => {
              const repDate = week.dates[0];
              let weekWorkTotal = 0;
              let weekRecogTotal = 0;

              const nameRows = allNames.map((name, ni) => {
                const emp = employees[name];
                const pos = emp?.position ?? "";

                // 이 주에 해당 직원 레코드 찾기
                let rec: WkRecord | null = null;
                for (const d of week.dates) {
                  const r = recMap.get(`${d}__${name}`);
                  if (r) { rec = r; break; }
                }

                let ciStr = "휴무", coStr = "휴무", breakStr = "", workStr = "", recogStr = "";
                if (rec && rec.checkIn) {
                  ciStr = fmtClock(new Date(rec.checkIn));
                  coStr = rec.checkOut ? fmtClock(new Date(rec.checkOut)) : "미타각";
                  if (rec.lunchMinutes > 0) breakStr = fmtHM(rec.lunchMinutes);
                  if (rec.workMinutes > 0) {
                    workStr = fmtHM(rec.workMinutes);
                    weekWorkTotal += rec.workMinutes;
                  }
                  const rg = recognized(rec.workMinutes);
                  if (rg > 0) {
                    recogStr = fmtHM(rg);
                    weekRecogTotal += rg;
                  }
                }

                const isEditing = editingKey === rec?.key;
                const isRest = ciStr === "휴무";
                const cum = wi === 0 ? cumulative.get(name) : null;

                return (
                  <tr
                    key={`${week.wk}-${name}`}
                    className={`${isRest ? "text-gray-400" : ""} hover:bg-blue-50/50 border-b border-dotted border-gray-200 last:border-solid last:border-gray-300`}
                  >
                    {ni === 0 && (
                      <td
                        rowSpan={allNames.length}
                        className="border-r border-gray-300 px-2 py-1 text-center align-middle font-medium bg-gray-50"
                      >
                        {repDate.slice(5)}
                      </td>
                    )}
                    <td className="border-r border-gray-200 px-2 py-1 text-center">{pos}</td>
                    <td className="border-r border-gray-200 px-2 py-1 text-center font-medium">{name}</td>

                    {/* 출근시간 */}
                    <td
                      className={`border-r border-gray-200 px-2 py-1 text-center ${!isRest ? "cursor-pointer hover:bg-yellow-50" : ""}`}
                      onDoubleClick={() => rec && !isRest && startEdit(rec)}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={editVal.checkIn}
                          onChange={(e) => setEditVal({ ...editVal, checkIn: e.target.value })}
                          className="w-full text-center text-xs border rounded px-1 py-0.5"
                          placeholder="HH:MM"
                          autoFocus
                        />
                      ) : ciStr}
                    </td>

                    {/* 퇴근시간 */}
                    <td
                      className={`border-r border-gray-200 px-2 py-1 text-center ${!isRest ? "cursor-pointer hover:bg-yellow-50" : ""}`}
                      onDoubleClick={() => rec && !isRest && startEdit(rec)}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={editVal.checkOut}
                          onChange={(e) => setEditVal({ ...editVal, checkOut: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(rec!); if (e.key === "Escape") setEditingKey(null); }}
                          className="w-full text-center text-xs border rounded px-1 py-0.5"
                          placeholder="HH:MM"
                        />
                      ) : coStr}
                    </td>

                    <td className="border-r border-gray-200 px-2 py-1 text-center">{breakStr}</td>
                    <td className="border-r border-gray-200 px-2 py-1 text-center font-medium">{workStr}</td>
                    <td className="border-r border-gray-300 px-2 py-1 text-center">{recogStr}</td>

                    {/* 구분 */}
                    <td className="border-r border-gray-300 bg-gray-100 w-[8px]"></td>

                    {/* 누적 (첫 주차만) */}
                    {wi === 0 ? (
                      <>
                        <td className="border-r border-gray-200 px-2 py-1 text-center">{pos}</td>
                        <td className="border-r border-gray-200 px-2 py-1 text-center font-medium">{name}</td>
                        <td className="border-r border-gray-200 px-2 py-1 text-center font-bold tabular-nums">
                          {cum ? Math.floor(cum.recogMins / 60) : 0}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {cum ? calcAllow(cum.recogMins).toLocaleString() : 0}
                        </td>
                      </>
                    ) : ni === 0 ? (
                      <td colSpan={4} rowSpan={allNames.length} className="bg-gray-50"></td>
                    ) : null}

                    {/* 편집 저장 버튼 */}
                    {isEditing && (
                      <td className="absolute">
                        <button
                          onClick={() => saveEdit(rec!)}
                          className="ml-1 px-2 py-0.5 text-[10px] bg-blue-600 text-white rounded"
                        >
                          저장
                        </button>
                      </td>
                    )}
                  </tr>
                );
              });

              // 소계 행
              const subtotalRow = (
                <tr key={`sub-${week.wk}`} className="bg-gray-100 font-bold border-b-2 border-gray-400">
                  <td className="border-r border-gray-300 px-2 py-1.5"></td>
                  <td colSpan={2} className="border-r border-gray-200 px-2 py-1.5 text-sm">
                    {siteName} 근무시간 합계
                  </td>
                  <td className="border-r border-gray-200"></td>
                  <td className="border-r border-gray-200"></td>
                  <td className="border-r border-gray-200"></td>
                  <td className="border-r border-gray-200 px-2 py-1.5 text-center tabular-nums">
                    {(weekWorkTotal / 60).toFixed(1)}
                  </td>
                  <td className="border-r border-gray-300 px-2 py-1.5 text-center tabular-nums">
                    {(weekRecogTotal / 60).toFixed(0)}
                  </td>
                  <td className="border-r border-gray-300 bg-gray-100"></td>
                  {wi === 0 ? (
                    <>
                      <td colSpan={2} className="border-r border-gray-200 px-2 py-1.5 text-sm">누적 합계</td>
                      <td className="border-r border-gray-200 px-2 py-1.5 text-center tabular-nums">
                        {Math.floor(Array.from(cumulative.values()).reduce((s, c) => s + c.recogMins, 0) / 60)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {Array.from(cumulative.values()).reduce((s, c) => s + calcAllow(c.recogMins), 0).toLocaleString()}
                      </td>
                    </>
                  ) : (
                    <td colSpan={4}></td>
                  )}
                </tr>
              );

              return [...nameRows, subtotalRow];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
