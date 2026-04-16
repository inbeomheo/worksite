import type { WkSite, WkRecord } from "./weekendTypes";

const MAX_DAY_WORK_MINUTES = 480;

export function fmtMin(m: number): string {
  if (!m || m <= 0) return "0:00";
  const h = Math.floor(m / 60);
  const n = Math.round(m % 60);
  return `${h}:${String(n).padStart(2, "0")}`;
}

export function fmtHours(m: number): string {
  return (m / 60).toFixed(1);
}

export function fmtClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function weekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function weekLabel(wk: string): string {
  const d = new Date(wk + "T00:00:00");
  const e = new Date(d);
  e.setDate(d.getDate() + 6);
  const f = (x: Date) =>
    `${String(x.getMonth() + 1).padStart(2, "0")}/${String(x.getDate()).padStart(2, "0")}`;
  return `${wk.slice(0, 4)} ${f(d)}~${f(e)}`;
}

export function calcWork(
  checkIn: Date | null,
  checkOut: Date | null,
  site: WkSite | null,
  lunchOverride?: number | null
): { workMinutes: number; stayMinutes: number; lunchMinutes: number; warnings: string[] } {
  const warnings: string[] = [];
  if (!checkIn) {
    warnings.push("출근시간 없음");
    return { workMinutes: 0, stayMinutes: 0, lunchMinutes: 0, warnings };
  }
  if (!checkOut) {
    warnings.push("퇴근시간 없음");
    return { workMinutes: 0, stayMinutes: 0, lunchMinutes: 0, warnings };
  }
  const stay = (checkOut.getTime() - checkIn.getTime()) / 60000;
  if (stay <= 0) {
    warnings.push("시간 역전");
    return { workMinutes: 0, stayMinutes: 0, lunchMinutes: 0, warnings };
  }
  const hasOverride = typeof lunchOverride === "number" && !isNaN(lunchOverride);
  if (!site && !hasOverride) {
    warnings.push("현장 미지정");
    return { workMinutes: 0, stayMinutes: Math.round(stay), lunchMinutes: 0, warnings };
  }
  const lunchBase = site?.lunchMinutes ?? 0;
  const inH = checkIn.getHours() + checkIn.getMinutes() / 60;
  const outH = checkOut.getHours() + checkOut.getMinutes() / 60;
  const skip = outH <= 12 || inH >= 13 || stay < 240;
  const lunch = hasOverride ? Math.max(0, lunchOverride!) : skip ? 0 : lunchBase;
  const raw = Math.max(0, Math.round(stay - lunch));
  return {
    workMinutes: Math.min(MAX_DAY_WORK_MINUTES, raw),
    stayMinutes: Math.round(stay),
    lunchMinutes: lunch,
    warnings,
  };
}

export function recomputeRecord(
  rec: WkRecord,
  sites: Record<string, WkSite>,
  employees: Record<string, { site: string | null }>
): void {
  const ci = rec.checkIn ? new Date(rec.checkIn) : null;
  const co = rec.checkOut ? new Date(rec.checkOut) : null;
  const empSite = employees[rec.name]?.site ?? null;
  const site = empSite ? sites[empSite] ?? null : null;
  const c = calcWork(ci, co, site, rec.lunchOverride);
  rec.site = empSite;
  rec.stayMinutes = c.stayMinutes;
  rec.lunchMinutes = c.lunchMinutes;
  rec.workMinutes = c.workMinutes;
  rec.warnings = c.warnings;
}

export function uid(prefix: string): string {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"] as const;
export function getDow(dateStr: string): string {
  return DOW[new Date(dateStr + "T00:00:00").getDay()];
}

export function reportPeriodRange(periodKey: string): { start: string; end: string } {
  const [y, m] = periodKey.split("-").map(Number);
  let sy = y, sm = m - 1;
  if (sm === 0) { sy = y - 1; sm = 12; }
  const pad = (n: number) => String(n).padStart(2, "0");
  return { start: `${sy}-${pad(sm)}-16`, end: `${y}-${pad(m)}-15` };
}

export function reportPeriodLabel(periodKey: string): string {
  const r = reportPeriodRange(periodKey);
  const [sy, sm] = r.start.split("-").map(Number);
  const [ey, em, ed] = r.end.split("-").map(Number);
  return sy === ey
    ? `${ey}년 ${em}월 주말근무현황 (${sm}월 16일 ~ ${em}월 ${ed}일)`
    : `${ey}년 ${em}월 주말근무현황 (${sy}년 ${sm}월 16일 ~ ${ey}년 ${em}월 ${ed}일)`;
}

export function currentReportPeriodKey(): string {
  const now = new Date();
  const day = now.getDate();
  let y = now.getFullYear(), m = now.getMonth() + 1;
  if (day >= 16) { m += 1; if (m === 13) { m = 1; y += 1; } }
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function heatClass(mins: number): string {
  if (!mins) return "";
  const h = mins / 60;
  if (h < 2) return "wk-heat-1";
  if (h < 4) return "wk-heat-2";
  if (h < 6) return "wk-heat-3";
  if (h < 8) return "wk-heat-4";
  return "wk-heat-5";
}
