import type {
  WkSite,
  WkEmployee,
  WkRecord,
  WkUpload,
  WkPreset,
  WkReportConfig,
  WkMonthlyReport,
  WkState,
} from "./weekendTypes";

// ─────────────────────────────────────────────
// localStorage 키
// ─────────────────────────────────────────────
const LS = {
  sites: "wk_sites",
  employees: "wk_employees",
  records: "wk_records",
  uploads: "wk_uploads",
  config: "wk_config",
} as const;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, data: unknown): void {
  localStorage.setItem(key, JSON.stringify(data));
}

const DEFAULT_REPORT_CONFIG: WkReportConfig = {
  defaultDepartment: "",
  approvalLine:
    "현장 담당자 작성 → 소속장(본부장/팀장) 결재 → 인사총무팀장 합의",
};

// ─────────────────────────────────────────────
// fetchWeekendState
// ─────────────────────────────────────────────
export async function fetchWeekendState(): Promise<WkState | null> {
  const sitesArr: WkSite[] = load(LS.sites, []);
  const employeesArr: WkEmployee[] = load(LS.employees, []);
  const recordsArr: WkRecord[] = load(LS.records, []);
  const uploads: WkUpload[] = load(LS.uploads, []);
  const config: Record<string, unknown> = load(LS.config, {});

  const sites: Record<string, WkSite> = {};
  for (const s of sitesArr) sites[s.name] = s;

  const employees: Record<string, WkEmployee> = {};
  for (const e of employeesArr) employees[e.name] = e;

  const records: Record<string, WkRecord> = {};
  for (const r of recordsArr) records[r.key] = r;

  const presets: WkPreset[] = (config.presets as WkPreset[]) ?? [];
  const monthlyReports: Record<string, WkMonthlyReport> =
    (config.monthlyReports as Record<string, WkMonthlyReport>) ?? {};
  const reportConfig: WkReportConfig =
    (config.reportConfig as WkReportConfig) ?? DEFAULT_REPORT_CONFIG;

  return {
    sites,
    employees,
    records,
    uploads: uploads.sort(
      (a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    ),
    presets,
    monthlyReports,
    reportConfig,
  };
}

// ─────────────────────────────────────────────
// saveWkSites
// ─────────────────────────────────────────────
export async function saveWkSites(sites: WkSite[]): Promise<void> {
  save(LS.sites, sites);
}

// ─────────────────────────────────────────────
// saveWkEmployee
// ─────────────────────────────────────────────
export async function saveWkEmployee(emp: WkEmployee): Promise<void> {
  const arr: WkEmployee[] = load(LS.employees, []);
  const idx = arr.findIndex((e) => e.name === emp.name);
  if (idx >= 0) arr[idx] = emp;
  else arr.push(emp);
  save(LS.employees, arr);
}

// ─────────────────────────────────────────────
// saveWkEmployeesBatch
// ─────────────────────────────────────────────
export async function saveWkEmployeesBatch(emps: WkEmployee[]): Promise<void> {
  if (emps.length === 0) return;
  const arr: WkEmployee[] = load(LS.employees, []);
  const map = new Map(arr.map((e) => [e.name, e]));
  for (const emp of emps) map.set(emp.name, emp);
  save(LS.employees, Array.from(map.values()));
}

// ─────────────────────────────────────────────
// deleteWkEmployee
// ─────────────────────────────────────────────
export async function deleteWkEmployee(name: string): Promise<void> {
  const emps: WkEmployee[] = load(LS.employees, []);
  save(LS.employees, emps.filter((e) => e.name !== name));

  const recs: WkRecord[] = load(LS.records, []);
  save(LS.records, recs.filter((r) => r.name !== name));
}

// ─────────────────────────────────────────────
// saveWkRecordsBatch
// ─────────────────────────────────────────────
export async function saveWkRecordsBatch(records: WkRecord[]): Promise<void> {
  if (records.length === 0) return;
  const arr: WkRecord[] = load(LS.records, []);
  const map = new Map(arr.map((r) => [r.key, r]));
  for (const rec of records) map.set(rec.key, rec);
  save(LS.records, Array.from(map.values()));
}

// ─────────────────────────────────────────────
// saveWkUpload
// ─────────────────────────────────────────────
export async function saveWkUpload(upload: WkUpload): Promise<void> {
  const arr: WkUpload[] = load(LS.uploads, []);
  const idx = arr.findIndex((u) => u.id === upload.id);
  if (idx >= 0) arr[idx] = upload;
  else arr.push(upload);
  save(LS.uploads, arr);
}

// ─────────────────────────────────────────────
// deleteWkUpload
// ─────────────────────────────────────────────
export async function deleteWkUpload(uploadId: string): Promise<void> {
  const recs: WkRecord[] = load(LS.records, []);
  save(
    LS.records,
    recs.filter((r) => !(r.uploadId === uploadId && !r.manualOverride))
  );

  const uploads: WkUpload[] = load(LS.uploads, []);
  save(LS.uploads, uploads.filter((u) => u.id !== uploadId));
}

// ─────────────────────────────────────────────
// saveWkConfig
// ─────────────────────────────────────────────
export async function saveWkConfig(key: string, value: unknown): Promise<void> {
  const config: Record<string, unknown> = load(LS.config, {});
  config[key] = value;
  save(LS.config, config);
}
