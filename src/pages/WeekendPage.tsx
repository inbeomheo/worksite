import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type {
  WkState,
  WkRecord,
  WkEmployee,
  WkMonthlyReport,
  WkReportConfig,
  UploadPreparation,
} from "@/lib/weekendTypes";
import { recomputeRecord, uid } from "@/lib/weekendCalc";
import {
  fetchWeekendState,
  saveWkSites,
  saveWkEmployee,
  saveWkEmployeesBatch,
  deleteWkEmployee,
  saveWkRecordsBatch,
  saveWkUpload,
  deleteWkUpload,
  saveWkConfig,
} from "@/lib/weekendSupabaseSync";
import { parseWeekendExcelFile, prepareWeekendUpload } from "@/lib/weekendParseExcel";
import WeekendLeaderboard from "@/components/weekend/WeekendLeaderboard";
import WeekendDetail from "@/components/weekend/WeekendDetail";
import WeekendWeeklyTable from "@/components/weekend/WeekendWeeklyTable";
import WeekendMonthlyReport from "@/components/weekend/WeekendMonthlyReport";
import WeekendEmployees from "@/components/weekend/WeekendEmployees";
import WeekendUploads from "@/components/weekend/WeekendUploads";
import WeekendSettings from "@/components/weekend/WeekendSettings";
import WeekendFileUpload from "@/components/weekend/WeekendFileUpload";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type SubTab =
  | "리더보드"
  | "개인상세"
  | "주별테이블"
  | "월간보고서"
  | "직원마스터"
  | "업로드이력"
  | "설정";

const SUB_TABS: { id: SubTab; icon: string }[] = [
  { id: "리더보드", icon: "📊" },
  { id: "개인상세", icon: "👤" },
  { id: "주별테이블", icon: "📅" },
  { id: "월간보고서", icon: "📄" },
  { id: "직원마스터", icon: "👥" },
  { id: "업로드이력", icon: "📂" },
  { id: "설정", icon: "⚙️" },
];

// ─────────────────────────────────────────────
// Default state
// ─────────────────────────────────────────────
const DEFAULT_STATE: WkState = {
  sites: {
    초순수: { name: "초순수", lunchMinutes: 120, department: "" },
    그린동: { name: "그린동", lunchMinutes: 90, department: "" },
  },
  employees: {},
  records: {},
  uploads: [],
  presets: [],
  monthlyReports: {},
  reportConfig: {
    defaultDepartment: "",
    approvalLine:
      "현장 담당자 작성 → 소속장(본부장/팀장) 결재 → 인사총무팀장 합의",
  },
};

// ─────────────────────────────────────────────
// Helper: array → Record keyed by name/key
// ─────────────────────────────────────────────
function toEmployeeMap(arr: WkEmployee[]): Record<string, WkEmployee> {
  const map: Record<string, WkEmployee> = {};
  for (const e of arr) map[e.name] = e;
  return map;
}

function toRecordMap(arr: WkRecord[]): Record<string, WkRecord> {
  const map: Record<string, WkRecord> = {};
  for (const r of arr) map[r.key] = r;
  return map;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export default function WeekendPage() {
  const [state, setState] = useState<WkState>(DEFAULT_STATE);
  const [subTab, setSubTab] = useState<SubTab>("리더보드");
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);

  // ── Load on mount ──────────────────────────
  useEffect(() => {
    const timeout = setTimeout(() => setIsLoading(false), 8000);
    (async () => {
      try {
        const raw = await fetchWeekendState();
        if (raw) {
          // fetchWeekendState returns arrays for employees/records; convert to maps
          const employees =
            Array.isArray(raw.employees)
              ? toEmployeeMap(raw.employees as unknown as WkEmployee[])
              : (raw.employees as Record<string, WkEmployee>);
          const records =
            Array.isArray(raw.records)
              ? toRecordMap(raw.records as unknown as WkRecord[])
              : (raw.records as Record<string, WkRecord>);
          // sites might be an array too
          const sites = Array.isArray(raw.sites)
            ? Object.fromEntries(
                (raw.sites as unknown as { name: string; lunchMinutes: number; department: string }[]).map(
                  (s) => [s.name, s]
                )
              )
            : raw.sites;
          setState({ ...raw, sites, employees, records });
        }
      } catch {
        // silently fail
      } finally {
        clearTimeout(timeout);
        setIsLoading(false);
      }
    })();
  }, []);

  // ── Year filter options ────────────────────
  const yearOptions = (() => {
    const years = new Set<string>();
    for (const r of Object.values(state.records)) {
      if (r.date) years.add(r.date.slice(0, 4));
    }
    return Array.from(years).sort().reverse();
  })();

  // ── Filtered records by year ───────────────
  const filteredRecords = Object.values(state.records).filter((r) =>
    yearFilter === "all" ? true : r.date.startsWith(yearFilter)
  );

  // ─────────────────────────────────────────────
  // Callbacks
  // ─────────────────────────────────────────────

  const handlePrepare = useCallback(
    async (files: File[]): Promise<UploadPreparation> => {
      const parsed = await Promise.all(
        files.map(async (file) => ({
          file,
          rows: await parseWeekendExcelFile(file),
        }))
      );
      return prepareWeekendUpload(
        parsed,
        state.employees,
        state.sites,
        state.uploads
      );
    },
    [state.employees, state.sites, state.uploads]
  );

  const handleApply = useCallback(
    async (prep: UploadPreparation): Promise<void> => {
      try {
        // Build new employee objects for newly discovered names
        const now = new Date().toISOString();
        const newEmps: WkEmployee[] = Array.from(prep.newEmployees)
          .filter((name) => !state.employees[name])
          .map((name) => ({
            name,
            site: null,
            organization: "",
            position: "",
            note: "",
            createdAt: now,
            updatedAt: now,
          }));

        // Persist records, employees, uploads
        await saveWkRecordsBatch(prep.newRecords);
        if (newEmps.length > 0) await saveWkEmployeesBatch(newEmps);
        for (const f of prep.files) {
          await saveWkUpload({
            id: f.uploadId,
            filename: f.filename,
            periodStart: f.period.start,
            periodEnd: f.period.end,
            uploadedAt: now,
            rowCount: f.rows.length,
            validRows: f.records.length,
          });
        }

        // Update local state
        setState((prev) => {
          const employees = { ...prev.employees };
          for (const e of newEmps) employees[e.name] = e;
          const records = { ...prev.records };
          for (const r of prep.newRecords) records[r.key] = r;
          const uploads = [
            ...prev.uploads,
            ...prep.files.map((f) => ({
              id: f.uploadId,
              filename: f.filename,
              periodStart: f.period.start,
              periodEnd: f.period.end,
              uploadedAt: now,
              rowCount: f.rows.length,
              validRows: f.records.length,
            })),
          ];
          return { ...prev, employees, records, uploads };
        });

        toast.success(`${prep.newRecords.length}건 반영 완료`);
      } catch (err: any) {
        toast.error(`반영 실패: ${err.message}`);
        throw err;
      }
    },
    [state.employees]
  );

  const handleSelectPerson = useCallback((name: string) => {
    setSelectedPerson(name);
    setSubTab("개인상세");
  }, []);

  const handleUpdateEmployee = useCallback(
    async (name: string, updates: Partial<WkEmployee>) => {
      try {
        const prev = state.employees[name];
        if (!prev) return;
        const updated: WkEmployee = {
          ...prev,
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        await saveWkEmployee(updated);

        // If site changed, recompute all records for this employee
        let records = { ...state.records };
        if (updates.site !== undefined && updates.site !== prev.site) {
          const tempEmps = { ...state.employees, [name]: updated };
          for (const key of Object.keys(records)) {
            if (records[key].name === name) {
              const rec = { ...records[key] };
              recomputeRecord(rec, state.sites, tempEmps);
              records[key] = rec;
            }
          }
          const changedRecords = Object.values(records).filter(
            (r) => r.name === name
          );
          if (changedRecords.length > 0) await saveWkRecordsBatch(changedRecords);
        }

        setState((prev) => ({
          ...prev,
          employees: { ...prev.employees, [name]: updated },
          records,
        }));
        toast.success(`${name} 정보 업데이트`);
      } catch (err: any) {
        toast.error(`업데이트 실패: ${err.message}`);
      }
    },
    [state]
  );

  const handleDeleteEmployee = useCallback(
    async (name: string) => {
      try {
        await deleteWkEmployee(name);
        setState((prev) => {
          const employees = { ...prev.employees };
          delete employees[name];
          const records = Object.fromEntries(
            Object.entries(prev.records).filter(([, r]) => r.name !== name)
          );
          return { ...prev, employees, records };
        });
        toast.success(`${name} 삭제 완료`);
      } catch (err: any) {
        toast.error(`삭제 실패: ${err.message}`);
      }
    },
    []
  );

  const handleDeleteUpload = useCallback(
    async (uploadId: string) => {
      try {
        await deleteWkUpload(uploadId);
        setState((prev) => ({
          ...prev,
          uploads: prev.uploads.filter((u) => u.id !== uploadId),
          records: Object.fromEntries(
            Object.entries(prev.records).filter(
              ([, r]) => !(r.uploadId === uploadId && !r.manualOverride)
            )
          ),
        }));
        toast.success("업로드 삭제 완료");
      } catch (err: any) {
        toast.error(`삭제 실패: ${err.message}`);
      }
    },
    []
  );

  const handleSaveSites = useCallback(
    async (sites: Record<string, { name: string; lunchMinutes: number; department: string }>) => {
      try {
        await saveWkSites(Object.values(sites));

        // Nullify employees whose site was deleted
        const deletedSiteNames = Object.keys(state.sites).filter(
          (s) => !sites[s]
        );
        const updatedEmployees = { ...state.employees };
        const empsToSave: WkEmployee[] = [];
        for (const [name, emp] of Object.entries(updatedEmployees)) {
          if (emp.site && deletedSiteNames.includes(emp.site)) {
            updatedEmployees[name] = { ...emp, site: null };
            empsToSave.push(updatedEmployees[name]);
          }
        }
        if (empsToSave.length > 0) await saveWkEmployeesBatch(empsToSave);

        // Recompute all records
        const records = { ...state.records };
        for (const key of Object.keys(records)) {
          const rec = { ...records[key] };
          recomputeRecord(rec, sites, updatedEmployees);
          records[key] = rec;
        }
        await saveWkRecordsBatch(Object.values(records));

        setState((prev) => ({
          ...prev,
          sites,
          employees: updatedEmployees,
          records,
        }));
        toast.success("현장 정보 저장 완료");
      } catch (err: any) {
        toast.error(`저장 실패: ${err.message}`);
      }
    },
    [state]
  );

  const handleSaveReportConfig = useCallback(
    async (config: WkReportConfig) => {
      try {
        await saveWkConfig("reportConfig", config);
        setState((prev) => ({ ...prev, reportConfig: config }));
        toast.success("보고서 설정 저장 완료");
      } catch (err: any) {
        toast.error(`저장 실패: ${err.message}`);
      }
    },
    []
  );

  const handleSaveReport = useCallback(
    async (periodKey: string, report: WkMonthlyReport) => {
      try {
        const next = { ...state.monthlyReports, [periodKey]: report };
        await saveWkConfig("monthlyReports", next);
        setState((prev) => ({ ...prev, monthlyReports: next }));
        toast.success("월간 보고서 저장 완료");
      } catch (err: any) {
        toast.error(`저장 실패: ${err.message}`);
      }
    },
    [state.monthlyReports]
  );

  const handleSavePreset = useCallback(
    async (name: string) => {
      try {
        const mapping: Record<string, string> = {};
        for (const [empName, emp] of Object.entries(state.employees)) {
          if (emp.site) mapping[empName] = emp.site;
        }
        const preset = {
          id: uid("preset"),
          name,
          mapping,
          createdAt: new Date().toISOString(),
        };
        const next = [...state.presets, preset];
        await saveWkConfig("presets", next);
        setState((prev) => ({ ...prev, presets: next }));
        toast.success(`프리셋 "${name}" 저장 완료`);
      } catch (err: any) {
        toast.error(`저장 실패: ${err.message}`);
      }
    },
    [state.employees, state.presets]
  );

  const handleApplyPreset = useCallback(
    async (presetId: string) => {
      try {
        const preset = state.presets.find((p) => p.id === presetId);
        if (!preset) return;
        const updatedEmployees = { ...state.employees };
        const empsToSave: WkEmployee[] = [];
        for (const [name, site] of Object.entries(preset.mapping)) {
          if (updatedEmployees[name]) {
            updatedEmployees[name] = { ...updatedEmployees[name], site };
            empsToSave.push(updatedEmployees[name]);
          }
        }
        if (empsToSave.length > 0) await saveWkEmployeesBatch(empsToSave);

        // Recompute records
        const records = { ...state.records };
        for (const key of Object.keys(records)) {
          const rec = { ...records[key] };
          recomputeRecord(rec, state.sites, updatedEmployees);
          records[key] = rec;
        }
        await saveWkRecordsBatch(Object.values(records));

        setState((prev) => ({
          ...prev,
          employees: updatedEmployees,
          records,
        }));
        toast.success(`프리셋 "${preset.name}" 적용 완료`);
      } catch (err: any) {
        toast.error(`적용 실패: ${err.message}`);
      }
    },
    [state]
  );

  const handleDeletePreset = useCallback(
    async (presetId: string) => {
      try {
        const next = state.presets.filter((p) => p.id !== presetId);
        await saveWkConfig("presets", next);
        setState((prev) => ({ ...prev, presets: next }));
        toast.success("프리셋 삭제 완료");
      } catch (err: any) {
        toast.error(`삭제 실패: ${err.message}`);
      }
    },
    [state.presets]
  );

  const handleBulkAssign = useCallback(
    async (site: string) => {
      try {
        const updatedEmployees = { ...state.employees };
        const empsToSave: WkEmployee[] = [];
        for (const [name, emp] of Object.entries(updatedEmployees)) {
          if (!emp.site) {
            updatedEmployees[name] = { ...emp, site };
            empsToSave.push(updatedEmployees[name]);
          }
        }
        if (empsToSave.length > 0) await saveWkEmployeesBatch(empsToSave);

        // Recompute records
        const records = { ...state.records };
        for (const key of Object.keys(records)) {
          const rec = { ...records[key] };
          recomputeRecord(rec, state.sites, updatedEmployees);
          records[key] = rec;
        }
        await saveWkRecordsBatch(Object.values(records));

        setState((prev) => ({
          ...prev,
          employees: updatedEmployees,
          records,
        }));
        toast.success(`미지정 직원 → "${site}" 일괄 배정 완료`);
      } catch (err: any) {
        toast.error(`일괄 배정 실패: ${err.message}`);
      }
    },
    [state]
  );

  const handleExportJson = useCallback(() => {
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weekend-state-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const handleImportJson = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const parsed: WkState = JSON.parse(text);
        // Save all to Supabase
        await saveWkSites(Object.values(parsed.sites));
        await saveWkEmployeesBatch(Object.values(parsed.employees));
        await saveWkRecordsBatch(Object.values(parsed.records));
        for (const upload of parsed.uploads) await saveWkUpload(upload);
        await saveWkConfig("presets", parsed.presets);
        await saveWkConfig("monthlyReports", parsed.monthlyReports);
        await saveWkConfig("reportConfig", parsed.reportConfig);
        setState(parsed);
        toast.success("JSON 가져오기 완료");
      } catch (err: any) {
        toast.error(`가져오기 실패: ${err.message}`);
      }
    },
    []
  );

  const handleReset = useCallback(async () => {
    try {
      setState(DEFAULT_STATE);
      toast.success("초기화 완료");
    } catch (err: any) {
      toast.error(`초기화 실패: ${err.message}`);
    }
  }, []);

  const handleEditRecord = useCallback((_key: string) => {
    // placeholder
  }, []);

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">데이터 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-3">
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-2 bg-white border border-border rounded-xl px-4 py-2.5 shadow-sm">
        {/* Sub-tab buttons */}
        <div className="flex flex-wrap gap-1.5 flex-1">
          {SUB_TABS.map(({ id, icon }) => (
            <button
              key={id}
              onClick={() => setSubTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${
                subTab === id
                  ? "bg-primary border-primary text-white"
                  : "bg-muted border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{icon}</span>
              <span>{id}</span>
            </button>
          ))}
        </div>

        {/* Year filter */}
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="bg-white border border-border text-foreground text-sm px-3 py-1.5 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <option value="all">전체 연도</option>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>

        {/* File upload */}
        <WeekendFileUpload onPrepare={handlePrepare} onApply={handleApply} />
      </div>

      {/* Sub-tab content */}
      {subTab === "리더보드" && (
        <WeekendLeaderboard
          records={filteredRecords}
          employees={state.employees}
          sites={state.sites}
          yearFilter={yearFilter}
          onSelectPerson={handleSelectPerson}
        />
      )}

      {subTab === "개인상세" && (
        <WeekendDetail
          records={filteredRecords}
          employees={state.employees}
          sites={state.sites}
          selectedName={selectedPerson}
          onSelectName={setSelectedPerson}
          onEditRecord={handleEditRecord}
        />
      )}

      {subTab === "주별테이블" && (
        <WeekendWeeklyTable
          records={filteredRecords}
          employees={state.employees}
          sites={state.sites}
          onSelectPerson={handleSelectPerson}
        />
      )}

      {subTab === "월간보고서" && (
        <WeekendMonthlyReport
          state={state}
          onSaveReport={handleSaveReport}
          onSaveConfig={handleSaveReportConfig}
        />
      )}

      {subTab === "직원마스터" && (
        <WeekendEmployees
          employees={state.employees}
          records={state.records}
          sites={state.sites}
          onUpdateEmployee={handleUpdateEmployee}
          onDeleteEmployee={handleDeleteEmployee}
          onBulkAssign={handleBulkAssign}
        />
      )}

      {subTab === "업로드이력" && (
        <WeekendUploads uploads={state.uploads} onDelete={handleDeleteUpload} />
      )}

      {subTab === "설정" && (
        <WeekendSettings
          state={state}
          onSaveSites={handleSaveSites}
          onSaveReportConfig={handleSaveReportConfig}
          onSavePreset={handleSavePreset}
          onApplyPreset={handleApplyPreset}
          onDeletePreset={handleDeletePreset}
          onExportJson={handleExportJson}
          onImportJson={handleImportJson}
          onReset={handleReset}
        />
      )}
    </div>
  );
}
