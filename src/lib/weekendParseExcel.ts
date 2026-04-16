import * as XLSX from "xlsx";
import { calcWork, uid } from "./weekendCalc";
import type {
  WkRecord,
  WkSite,
  WkUpload,
  WkCumulative,
  UploadPreparation,
} from "./weekendTypes";

// ---------------------------------------------------------------------------
// 컬럼 매핑 — 우선순위: 실제 엑셀 양식 > 대체 이름
// ---------------------------------------------------------------------------
const COL = {
  date: ["근무일자", "날짜", "일자"],
  name: ["이름", "성명"],
  org: ["조직", "소속", "부서"],
  position: ["직급", "직위", "직종"],
  empId: ["사원번호"],
  workGroup: ["근무조"],
  schedule: ["근무스케줄"],
  checkIn: ["출근시간"],
  checkOut: ["퇴근시간"],
  checkInStatus: ["출근판정"],
  holidayWork: ["휴일근무시간"],
} as const;

function col(row: Record<string, unknown>, keys: readonly string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && v !== "") return String(v).trim();
  }
  return "";
}

function colRaw(row: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const k of keys) {
    if (row[k] != null && row[k] !== "") return row[k];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helper: Excel serial / Date / string → Date | null
// ---------------------------------------------------------------------------
function parseTime(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;

  if (typeof v === "number") {
    const ms = (v - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof v === "string") {
    const s = v.trim();
    if (!s || s === "미타각") return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helper: value → "YYYY-MM-DD" | null
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
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helper: "HH:MM" 형태의 시간 문자열 → 분
// ---------------------------------------------------------------------------
function parseHHMM(v: unknown): number | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

// ---------------------------------------------------------------------------
// 시트 자동 감지: 헤더에 특정 컬럼 조합이 있으면 해당 시트
// ---------------------------------------------------------------------------
function findSheetByHeaders(
  wb: XLSX.WorkBook,
  requiredCols: string[]
): { name: string; rows: Record<string, unknown>[] } | null {
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws["!ref"]) continue;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: "",
    });
    if (rows.length === 0) continue;
    const headers = Object.keys(rows[0]);
    const matched = requiredCols.every((c) => headers.includes(c));
    if (matched) return { name: sheetName, rows };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 휴일 판별: 근무스케줄="휴일" OR 출근판정에 "휴일" 포함
// ---------------------------------------------------------------------------
function isHolidayRow(row: Record<string, unknown>): boolean {
  const schedule = col(row, COL.schedule);
  if (schedule === "휴일") return true;
  const status = col(row, COL.checkInStatus);
  if (status.includes("휴일")) return true;
  return false;
}

// ---------------------------------------------------------------------------
// 기간 추출 (파일명 or 날짜 범위)
// ---------------------------------------------------------------------------
function extractPeriod(
  filename: string,
  dates: string[]
): { start: string; end: string } {
  const ymMatch = filename.match(/(\d{4})[.\-_]?(\d{2})/);
  if (ymMatch) {
    const y = parseInt(ymMatch[1]);
    const m = parseInt(ymMatch[2]);
    if (y >= 2000 && m >= 1 && m <= 12) {
      const pad = (n: number) => String(n).padStart(2, "0");
      let sy = y,
        sm = m - 1;
      if (sm === 0) {
        sy = y - 1;
        sm = 12;
      }
      return { start: `${sy}-${pad(sm)}-16`, end: `${y}-${pad(m)}-15` };
    }
  }
  if (dates.length === 0) {
    const today = new Date().toISOString().slice(0, 10);
    return { start: today, end: today };
  }
  const sorted = [...dates].sort();
  return { start: sorted[0], end: sorted[sorted.length - 1] };
}

// ---------------------------------------------------------------------------
// 근무시간 확인 시트 파싱 → WkCumulative[]
// ---------------------------------------------------------------------------
function parseCumulativeSheet(wb: XLSX.WorkBook): WkCumulative[] {
  // "근무시간 확인" 시트 찾기
  const sheetName = wb.SheetNames.find((n) => n.includes("근무시간"));
  if (!sheetName) return [];

  const ws = wb.Sheets[sheetName];
  if (!ws["!ref"]) return [];

  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
  });
  if (raw.length < 2) return [];

  // 헤더(0행) 확인 — 오른쪽 영역(J~M)에 누적 데이터
  // col 9=직급, 10=이름, 11=누적근무시간, 12=수당
  const result: WkCumulative[] = [];
  for (let i = 1; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    const name = String(row[10] ?? "").trim();
    if (!name || name.includes("합계")) continue;

    const position = String(row[9] ?? "").trim();
    const hoursRaw = row[11];
    const allowRaw = row[12];
    if (hoursRaw === "" && allowRaw === "") continue;

    // 시간은 일(day) 분수로 저장됨 → 시간으로 변환 (×24)
    const totalHours =
      typeof hoursRaw === "number" ? Math.round(hoursRaw * 24 * 100) / 100 : 0;
    const allowance =
      typeof allowRaw === "number"
        ? allowRaw
        : typeof allowRaw === "string"
          ? parseInt(allowRaw.replace(/[^0-9]/g, "")) || 0
          : 0;

    result.push({ name, position, totalHours, allowance });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public: 엑셀 파일 파싱 → raw data 시트의 row 객체 배열
// ---------------------------------------------------------------------------
export async function parseWeekendExcelFile(
  file: File
): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });

  // 1) raw data 시트 찾기: "근무일자" + "이름" + "출근시간" 헤더가 있는 시트
  const detected = findSheetByHeaders(wb, ["근무일자", "이름", "출근시간"]);
  if (detected) return detected.rows;

  // 2) 대체: "성명" 기반 헤더
  const alt = findSheetByHeaders(wb, ["근무일자", "성명", "출근시간"]);
  if (alt) return alt.rows;

  // 3) 폴백: 첫 번째 시트
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    defval: "",
  });
}

// ---------------------------------------------------------------------------
// Internal: 엑셀 workbook에서 누적 데이터 추출
// ---------------------------------------------------------------------------
export async function parseWeekendCumulative(
  file: File
): Promise<WkCumulative[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  return parseCumulativeSheet(wb);
}

// ---------------------------------------------------------------------------
// Public: 업로드 준비 — 검증 + 레코드 생성 + 누적 데이터
// ---------------------------------------------------------------------------
export function prepareWeekendUpload(
  files: { file: File; rows: Record<string, unknown>[]; cumulative?: WkCumulative[] }[],
  existingEmployees: Record<string, { site: string | null }>,
  sites: Record<string, WkSite>,
  existingUploads: WkUpload[]
): UploadPreparation {
  const allNewRecords: WkRecord[] = [];
  const allWarnings: { rec: WkRecord; issues: string[] }[] = [];
  const newEmployees = new Set<string>();
  const overlaps: UploadPreparation["overlaps"] = [];
  const fileResults: UploadPreparation["files"] = [];
  let allCumulative: WkCumulative[] = [];

  for (const { file, rows, cumulative } of files) {
    const uploadId = uid("wku");
    const fileRecords: WkRecord[] = [];
    const dateSeen: string[] = [];

    if (cumulative && cumulative.length > 0) {
      allCumulative = cumulative;
    }

    for (const r of rows) {
      // 휴일 필터: 근무스케줄="휴일" OR 출근판정에 "휴일" 포함
      if (!isHolidayRow(r)) continue;

      // 출근시간 필수 (결근 배정자 제외)
      const checkInRaw = colRaw(r, COL.checkIn);
      if (!checkInRaw) continue;

      const name = col(r, COL.name);
      if (!name) continue;

      const dateRaw = colRaw(r, COL.date);
      const date = parseDate(dateRaw);
      if (!date) continue;

      dateSeen.push(date);

      const organization = col(r, COL.org);
      const position = col(r, COL.position);
      const employeeId = col(r, COL.empId);
      const workGroup = col(r, COL.workGroup);
      const schedule = col(r, COL.schedule);

      const ci = parseTime(checkInRaw);
      const co = parseTime(colRaw(r, COL.checkOut));

      // 원본 휴일근무시간 (HH:MM → 분)
      const sourceWorkMinutes = parseHHMM(colRaw(r, COL.holidayWork));

      // 현장 기반 계산
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
        employeeId,
        workGroup,
        sourceWorkMinutes,
      };

      // 원본 시간과 계산 시간 불일치 경고
      if (
        sourceWorkMinutes != null &&
        calc.workMinutes > 0 &&
        Math.abs(calc.workMinutes - sourceWorkMinutes) > 15
      ) {
        rec.warnings = [
          ...rec.warnings,
          `원본(${Math.floor(sourceWorkMinutes / 60)}:${String(sourceWorkMinutes % 60).padStart(2, "0")})과 계산값 차이`,
        ];
      }

      fileRecords.push(rec);

      if (calc.warnings.length > 0) {
        allWarnings.push({ rec, issues: calc.warnings });
      }

      if (!existingEmployees[name]) {
        newEmployees.add(name);
      }
    }

    const period = extractPeriod(file.name, dateSeen);

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
    cumulative: allCumulative,
  };
}
