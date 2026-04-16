import * as XLSX from "xlsx";
import { calcWork, uid } from "./weekendCalc";
import type { WkRecord, WkSite, WkUpload, UploadPreparation } from "./weekendTypes";

// ---------------------------------------------------------------------------
// Helper: Excel serial number or Date object or string → Date | null
// ---------------------------------------------------------------------------
function parseTime(v: unknown): Date | null {
  if (v == null || v === "") return null;

  if (v instanceof Date) {
    return isNaN(v.getTime()) ? null : v;
  }

  if (typeof v === "number") {
    // Excel datetime serial (days since 1900-01-00)
    const ms = (v - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    // "YYYY-MM-DD HH:MM:SS" or ISO-like
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helper: value → "YYYY-MM-DD" string | null
// ---------------------------------------------------------------------------
function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;

  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }

  if (typeof v === "number") {
    const ms = (v - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    // Use UTC to avoid timezone shift on date-only serials
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    // Already "YYYY-MM-DD"
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helper: extract period from filename or fall back to min/max dates
// ---------------------------------------------------------------------------
function extractPeriod(
  filename: string,
  dates: string[]
): { start: string; end: string } {
  // Try filename pattern: e.g. "2026-03", "202603", "26-03", etc.
  const ymMatch = filename.match(/(\d{4})[.\-_]?(\d{2})/);
  if (ymMatch) {
    const y = parseInt(ymMatch[1]);
    const m = parseInt(ymMatch[2]);
    if (y >= 2000 && m >= 1 && m <= 12) {
      const pad = (n: number) => String(n).padStart(2, "0");
      // Period: 16th of prev month ~ 15th of this month
      let sy = y, sm = m - 1;
      if (sm === 0) { sy = y - 1; sm = 12; }
      return {
        start: `${sy}-${pad(sm)}-16`,
        end: `${y}-${pad(m)}-15`,
      };
    }
  }

  // Fall back to min/max of actual dates
  if (dates.length === 0) {
    const today = new Date().toISOString().slice(0, 10);
    return { start: today, end: today };
  }
  const sorted = [...dates].sort();
  return { start: sorted[0], end: sorted[sorted.length - 1] };
}

// ---------------------------------------------------------------------------
// Public: read first sheet of xlsx file → array of row objects
// ---------------------------------------------------------------------------
export async function parseWeekendExcelFile(
  file: File
): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    defval: "",
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Public: prepare upload from multiple files
// ---------------------------------------------------------------------------
export function prepareWeekendUpload(
  files: { file: File; rows: Record<string, unknown>[] }[],
  existingEmployees: Record<string, { site: string | null }>,
  sites: Record<string, WkSite>,
  existingUploads: WkUpload[]
): UploadPreparation {
  const allNewRecords: WkRecord[] = [];
  const allWarnings: { rec: WkRecord; issues: string[] }[] = [];
  const newEmployees = new Set<string>();
  const overlaps: UploadPreparation["overlaps"] = [];
  const fileResults: UploadPreparation["files"] = [];

  for (const { file, rows } of files) {
    const uploadId = uid("wku");
    const fileRecords: WkRecord[] = [];
    const dateSeen: string[] = [];

    for (const r of rows) {
      // Weekend filter
      const schedule = String(r["근무스케줄"] ?? "").trim();
      if (schedule !== "휴일") continue;
      if (!r["출근시간"]) continue;

      const name = String(r["성명"] ?? r["이름"] ?? "").trim();
      if (!name) continue;

      const dateRaw = r["근무일자"] ?? r["날짜"] ?? r["일자"];
      const date = parseDate(dateRaw);
      if (!date) continue;

      dateSeen.push(date);

      const organization = String(r["소속"] ?? r["부서"] ?? r["조직"] ?? "").trim();
      const position = String(r["직위"] ?? r["직종"] ?? r["직급"] ?? "").trim();

      const ci = parseTime(r["출근시간"]);
      const co = parseTime(r["퇴근시간"]);

      // Determine site from employee registry
      const empSite = existingEmployees[name]?.site ?? null;
      const site = empSite ? (sites[empSite] ?? null) : null;

      const calc = calcWork(ci, co, site);

      const key = `${date}__${name}`;

      const rec: WkRecord = {
        key,
        date,
        name,
        organization,
        position,
        schedule,
        checkIn: ci ? ci.toISOString() : null,
        checkOut: co ? co.toISOString() : null,
        site: empSite,
        stayMinutes: calc.stayMinutes,
        lunchMinutes: calc.lunchMinutes,
        workMinutes: calc.workMinutes,
        warnings: calc.warnings,
        manualOverride: false,
        lunchOverride: null,
        uploadId,
      };

      fileRecords.push(rec);

      if (calc.warnings.length > 0) {
        allWarnings.push({ rec, issues: calc.warnings });
      }

      // Track new employees
      if (!existingEmployees[name]) {
        newEmployees.add(name);
      }
    }

    // Extract period
    const period = extractPeriod(file.name, dateSeen);

    // Detect overlaps with existing uploads
    const overlapUploads = existingUploads.filter(
      (u) => u.periodStart <= period.end && u.periodEnd >= period.start
    );
    if (overlapUploads.length > 0) {
      overlaps.push({ filename: file.name, period, overlap: overlapUploads });
    }

    fileResults.push({
      filename: file.name,
      rows,
      period,
      uploadId,
      records: fileRecords,
    });

    allNewRecords.push(...fileRecords);
  }

  return {
    newRecords: allNewRecords,
    warnings: allWarnings,
    newEmployees,
    overlaps,
    files: fileResults,
  };
}
