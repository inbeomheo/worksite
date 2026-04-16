import { supabase } from "@/integrations/supabase/client";
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

const DEFAULT_REPORT_CONFIG: WkReportConfig = {
  defaultDepartment: "",
  approvalLine:
    "현장 담당자 작성 → 소속장(본부장/팀장) 결재 → 인사총무팀장 합의",
};

// ─────────────────────────────────────────────
// fetchWeekendState
// ─────────────────────────────────────────────
export async function fetchWeekendState(): Promise<WkState | null> {
  const [sitesRes, employeesRes, recordsRes, uploadsRes, configRes] =
    await Promise.all([
      (supabase as any).from("wk_sites").select("*"),
      (supabase as any).from("wk_employees").select("*"),
      (supabase as any).from("wk_records").select("*"),
      (supabase as any)
        .from("wk_uploads")
        .select("*")
        .order("uploaded_at", { ascending: false }),
      (supabase as any).from("wk_config").select("*"),
    ]);

  // Map sites
  const sites: WkSite[] = ((sitesRes.data as any[]) || []).map((row) => ({
    name: row.name,
    lunchMinutes: row.lunch_minutes,
    department: row.department ?? "",
    createdAt: row.created_at,
  }));

  // Map employees
  const employees: WkEmployee[] = (
    (employeesRes.data as any[]) || []
  ).map((row) => ({
    name: row.name,
    site: row.site,
    organization: row.organization ?? "",
    position: row.position ?? "",
    note: row.note ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  // Map records
  const records: WkRecord[] = ((recordsRes.data as any[]) || []).map((row) => ({
    key: row.key,
    date: row.date,
    name: row.name,
    organization: row.organization ?? "",
    position: row.position ?? "",
    schedule: row.schedule ?? "",
    checkIn: row.check_in ?? "",
    checkOut: row.check_out ?? "",
    site: row.site ?? "",
    stayMinutes: row.stay_minutes ?? 0,
    lunchMinutes: row.lunch_minutes ?? 0,
    workMinutes: row.work_minutes ?? 0,
    warnings: row.warnings ?? [],
    manualOverride: row.manual_override ?? false,
    lunchOverride: row.lunch_override ?? false,
    uploadId: row.upload_id ?? null,
    createdAt: row.created_at,
  }));

  // Map uploads
  const uploads: WkUpload[] = ((uploadsRes.data as any[]) || []).map((row) => ({
    id: row.id,
    filename: row.filename,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    uploadedAt: row.uploaded_at,
    rowCount: row.row_count,
    validRows: row.valid_rows,
  }));

  // Parse config rows
  const configRows: { key: string; value: any }[] = (
    (configRes.data as any[]) || []
  ).map((row) => ({ key: row.key, value: row.value }));

  const presetsRow = configRows.find((r) => r.key === "presets");
  const monthlyReportsRow = configRows.find((r) => r.key === "monthlyReports");
  const reportConfigRow = configRows.find((r) => r.key === "reportConfig");

  const presets: WkPreset[] = presetsRow?.value ?? [];
  const monthlyReports: WkMonthlyReport[] = monthlyReportsRow?.value ?? [];
  const reportConfig: WkReportConfig =
    reportConfigRow?.value ?? DEFAULT_REPORT_CONFIG;

  return {
    sites,
    employees,
    records,
    uploads,
    presets,
    monthlyReports,
    reportConfig,
  };
}

// ─────────────────────────────────────────────
// saveWkSites — delete all then upsert
// ─────────────────────────────────────────────
export async function saveWkSites(sites: WkSite[]): Promise<void> {
  const { error: deleteError } = await (supabase as any)
    .from("wk_sites")
    .delete()
    .neq("name", "");
  if (deleteError)
    throw new Error(`wk_sites delete error: ${deleteError.message}`);

  if (sites.length === 0) return;

  const rows = sites.map((s) => ({
    name: s.name,
    lunch_minutes: s.lunchMinutes,
    department: s.department ?? "",
  }));

  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await (supabase as any)
      .from("wk_sites")
      .upsert(rows.slice(i, i + 50), { onConflict: "name" });
    if (error) throw new Error(`wk_sites upsert error: ${error.message}`);
  }
}

// ─────────────────────────────────────────────
// saveWkEmployee — single upsert
// ─────────────────────────────────────────────
export async function saveWkEmployee(emp: WkEmployee): Promise<void> {
  const row = {
    name: emp.name,
    site: emp.site,
    organization: emp.organization ?? "",
    position: emp.position ?? "",
    note: emp.note ?? "",
  };
  const { error } = await (supabase as any)
    .from("wk_employees")
    .upsert(row, { onConflict: "name" });
  if (error) throw new Error(`wk_employees upsert error: ${error.message}`);
}

// ─────────────────────────────────────────────
// saveWkEmployeesBatch — batch upsert (50 per batch)
// ─────────────────────────────────────────────
export async function saveWkEmployeesBatch(emps: WkEmployee[]): Promise<void> {
  if (emps.length === 0) return;

  const rows = emps.map((emp) => ({
    name: emp.name,
    site: emp.site,
    organization: emp.organization ?? "",
    position: emp.position ?? "",
    note: emp.note ?? "",
  }));

  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await (supabase as any)
      .from("wk_employees")
      .upsert(rows.slice(i, i + 50), { onConflict: "name" });
    if (error)
      throw new Error(`wk_employees batch upsert error: ${error.message}`);
  }
}

// ─────────────────────────────────────────────
// deleteWkEmployee — delete employee + their records
// ─────────────────────────────────────────────
export async function deleteWkEmployee(name: string): Promise<void> {
  const { error: recordsError } = await (supabase as any)
    .from("wk_records")
    .delete()
    .eq("name", name);
  if (recordsError)
    throw new Error(
      `wk_records delete (employee) error: ${recordsError.message}`
    );

  const { error: empError } = await (supabase as any)
    .from("wk_employees")
    .delete()
    .eq("name", name);
  if (empError)
    throw new Error(`wk_employees delete error: ${empError.message}`);
}

// ─────────────────────────────────────────────
// saveWkRecordsBatch — batch upsert (50 per batch)
// ─────────────────────────────────────────────
export async function saveWkRecordsBatch(records: WkRecord[]): Promise<void> {
  if (records.length === 0) return;

  const rows = records.map((r) => ({
    key: r.key,
    date: r.date,
    name: r.name,
    organization: r.organization ?? "",
    position: r.position ?? "",
    schedule: r.schedule ?? "",
    check_in: r.checkIn ?? "",
    check_out: r.checkOut ?? "",
    site: r.site ?? "",
    stay_minutes: r.stayMinutes ?? 0,
    lunch_minutes: r.lunchMinutes ?? 0,
    work_minutes: r.workMinutes ?? 0,
    warnings: r.warnings ?? [],
    manual_override: r.manualOverride ?? false,
    lunch_override: r.lunchOverride ?? false,
    upload_id: r.uploadId ?? null,
  }));

  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await (supabase as any)
      .from("wk_records")
      .upsert(rows.slice(i, i + 50), { onConflict: "key" });
    if (error)
      throw new Error(`wk_records batch upsert error: ${error.message}`);
  }
}

// ─────────────────────────────────────────────
// saveWkUpload — single upsert
// ─────────────────────────────────────────────
export async function saveWkUpload(upload: WkUpload): Promise<void> {
  const row = {
    id: upload.id,
    filename: upload.filename,
    period_start: upload.periodStart,
    period_end: upload.periodEnd,
    row_count: upload.rowCount,
    valid_rows: upload.validRows,
  };
  const { error } = await (supabase as any)
    .from("wk_uploads")
    .upsert(row, { onConflict: "id" });
  if (error) throw new Error(`wk_uploads upsert error: ${error.message}`);
}

// ─────────────────────────────────────────────
// deleteWkUpload — delete upload + non-manual records with that upload_id
// ─────────────────────────────────────────────
export async function deleteWkUpload(uploadId: string): Promise<void> {
  const { error: recordsError } = await (supabase as any)
    .from("wk_records")
    .delete()
    .eq("upload_id", uploadId)
    .eq("manual_override", false);
  if (recordsError)
    throw new Error(
      `wk_records delete (upload) error: ${recordsError.message}`
    );

  const { error: uploadError } = await (supabase as any)
    .from("wk_uploads")
    .delete()
    .eq("id", uploadId);
  if (uploadError)
    throw new Error(`wk_uploads delete error: ${uploadError.message}`);
}

// ─────────────────────────────────────────────
// saveWkConfig — upsert to wk_config
// ─────────────────────────────────────────────
export async function saveWkConfig(key: string, value: unknown): Promise<void> {
  const { error } = await (supabase as any)
    .from("wk_config")
    .upsert({ key, value }, { onConflict: "key" });
  if (error) throw new Error(`wk_config upsert error: ${error.message}`);
}
