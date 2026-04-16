import { useState, useRef } from "react";
import type { WkState, WkSite, WkReportConfig } from "@/lib/weekendTypes";
import { fmtMin } from "@/lib/weekendCalc";

interface Props {
  state: WkState;
  onSaveSites: (sites: Record<string, WkSite>) => void;
  onSaveReportConfig: (config: WkReportConfig) => void;
  onSavePreset: (name: string) => void;
  onApplyPreset: (presetId: string) => void;
  onDeletePreset: (presetId: string) => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onReset: () => void;
}

interface SiteRow {
  key: string;
  name: string;
  department: string;
  lunchMinutes: number;
}

export default function WeekendSettings({
  state,
  onSaveSites,
  onSaveReportConfig,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
  onExportJson,
  onImportJson,
  onReset,
}: Props) {
  // --- 현장 설정 로컬 상태 ---
  const [siteRows, setSiteRows] = useState<SiteRow[]>(() =>
    Object.entries(state.sites).map(([key, s]) => ({
      key,
      name: s.name,
      department: s.department,
      lunchMinutes: s.lunchMinutes,
    }))
  );

  // --- 보고서 기본값 로컬 상태 ---
  const [reportDept, setReportDept] = useState(state.reportConfig.defaultDepartment);
  const [approvalLine, setApprovalLine] = useState(state.reportConfig.approvalLine);

  // --- 프리셋 이름 입력 ---
  const [presetName, setPresetName] = useState("");

  // --- 파일 input ref ---
  const fileInputRef = useRef<HTMLInputElement>(null);

  // === 현장 설정 ===
  function addSiteRow() {
    setSiteRows((prev) => [
      ...prev,
      { key: `site_${Date.now()}`, name: "", department: "", lunchMinutes: 60 },
    ]);
  }

  function removeSiteRow(key: string) {
    setSiteRows((prev) => prev.filter((r) => r.key !== key));
  }

  function updateSiteRow(key: string, field: keyof SiteRow, value: string | number) {
    setSiteRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r))
    );
  }

  function handleSaveSites() {
    const names = siteRows.map((r) => r.name.trim()).filter(Boolean);
    const unique = new Set(names);
    if (unique.size !== names.length) {
      alert("현장명이 중복됩니다. 중복을 제거해주세요.");
      return;
    }
    const sitesObj: Record<string, WkSite> = {};
    for (const row of siteRows) {
      const trimmed = row.name.trim();
      if (!trimmed) continue;
      sitesObj[trimmed] = {
        name: trimmed,
        department: row.department,
        lunchMinutes: Number(row.lunchMinutes),
      };
    }
    onSaveSites(sitesObj);
  }

  // === 보고서 기본값 ===
  function handleSaveReportConfig() {
    onSaveReportConfig({ defaultDepartment: reportDept, approvalLine });
  }

  // === 프리셋 저장 ===
  function handleSavePreset() {
    if (!presetName.trim()) return;
    onSavePreset(presetName.trim());
    setPresetName("");
  }

  // === 가져오기 ===
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onImportJson(file);
      e.target.value = "";
    }
  }

  // === 위험 구역 ===
  function handleReset() {
    if (window.confirm("모든 데이터를 삭제합니다. 복구할 수 없습니다.")) {
      onReset();
    }
  }

  const totalWorkMinutes = Object.values(state.records).reduce(
    (sum, r) => sum + r.workMinutes,
    0
  );

  return (
    <div className="space-y-6">
      {/* 현장 & 점심시간 설정 */}
      <section className="border rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-gray-800">현장 & 점심시간 설정</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-2 py-2 font-medium text-gray-600">현장명</th>
                <th className="text-left px-2 py-2 font-medium text-gray-600">부서</th>
                <th className="text-left px-2 py-2 font-medium text-gray-600">점심(분)</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {siteRows.map((row) => (
                <tr key={row.key} className="border-b">
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) => updateSiteRow(row.key, "name", e.target.value)}
                      className="border rounded px-2 py-1 text-sm w-full"
                      placeholder="현장명"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      value={row.department}
                      onChange={(e) => updateSiteRow(row.key, "department", e.target.value)}
                      className="border rounded px-2 py-1 text-sm w-full"
                      placeholder="부서명"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      value={row.lunchMinutes}
                      onChange={(e) =>
                        updateSiteRow(row.key, "lunchMinutes", parseInt(e.target.value) || 0)
                      }
                      className="border rounded px-2 py-1 text-sm w-24"
                      min={0}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <button
                      onClick={() => removeSiteRow(row.key)}
                      className="text-red-500 hover:text-red-700 text-sm px-2 py-1"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2">
          <button
            onClick={addSiteRow}
            className="text-sm px-3 py-1.5 border rounded-md hover:bg-gray-50"
          >
            + 현장 추가
          </button>
          <button
            onClick={handleSaveSites}
            className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            저장
          </button>
        </div>
      </section>

      {/* 월간보고서 기본값 */}
      <section className="border rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-gray-800">월간보고서 기본값</h3>
        <div className="space-y-2">
          <div>
            <label className="block text-sm text-gray-600 mb-1">기본 부서명</label>
            <input
              type="text"
              value={reportDept}
              onChange={(e) => setReportDept(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm w-full max-w-sm"
              placeholder="예: 개발2팀"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">결재라인</label>
            <textarea
              value={approvalLine}
              onChange={(e) => setApprovalLine(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm w-full max-w-lg resize-y"
              rows={3}
              placeholder="결재라인을 입력하세요"
            />
          </div>
        </div>
        <button
          onClick={handleSaveReportConfig}
          className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          저장
        </button>
      </section>

      {/* 현장 매핑 프리셋 */}
      <section className="border rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-gray-800">현장 매핑 프리셋</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm flex-1 max-w-xs"
            placeholder="프리셋 이름"
          />
          <button
            onClick={handleSavePreset}
            disabled={!presetName.trim()}
            className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            현재 매핑으로 저장
          </button>
        </div>
        {state.presets.length === 0 ? (
          <p className="text-sm text-gray-400">저장된 프리셋 없음</p>
        ) : (
          <ul className="space-y-2">
            {state.presets.map((preset) => {
              const mappingCount = Object.keys(preset.mapping).length;
              const siteList = [...new Set(Object.values(preset.mapping))].join(", ");
              return (
                <li
                  key={preset.id}
                  className="flex items-center justify-between border rounded px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">{preset.name}</span>
                    <span className="text-gray-400 ml-2">
                      매핑 {mappingCount}건
                    </span>
                    {siteList && (
                      <span className="text-gray-500 ml-2 text-xs">({siteList})</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onApplyPreset(preset.id)}
                      className="text-blue-600 hover:text-blue-800 px-2 py-1"
                    >
                      적용
                    </button>
                    <button
                      onClick={() => onDeletePreset(preset.id)}
                      className="text-red-500 hover:text-red-700 px-2 py-1"
                    >
                      삭제
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 백업 & 복원 */}
      <section className="border rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-gray-800">백업 & 복원</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onExportJson}
            className="text-sm px-3 py-1.5 border rounded-md hover:bg-gray-50"
          >
            JSON으로 내보내기
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-sm px-3 py-1.5 border rounded-md hover:bg-gray-50"
          >
            JSON 가져오기
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </section>

      {/* 위험 구역 */}
      <section className="border border-red-300 rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-red-700">위험 구역</h3>
        <p className="text-sm text-gray-600">
          모든 직원, 근무 기록, 업로드 이력, 설정이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
        </p>
        <button
          onClick={handleReset}
          className="text-sm px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700"
        >
          전체 데이터 초기화
        </button>
      </section>

      {/* 앱 정보 */}
      <section className="border rounded-lg p-4 space-y-2 text-sm text-gray-600">
        <h3 className="font-semibold text-gray-800">앱 정보</h3>
        <p>버전: v0.5</p>
        <p>직원 수: {Object.keys(state.employees).length}명</p>
        <p>근무 기록: {Object.keys(state.records).length}건</p>
        <p>업로드 이력: {state.uploads.length}건</p>
        <p>총 집계 근무시간: {fmtMin(totalWorkMinutes)}</p>
        <div className="mt-2 pt-2 border-t text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-600">집계 룰 설명</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>현장 미지정 직원의 근무시간은 0으로 집계됩니다.</li>
            <li>점심시간은 체류시간 4시간 미만, 퇴근 12시 이전, 출근 13시 이후인 경우 차감하지 않습니다.</li>
            <li>하루 최대 근무시간은 8시간(480분)으로 제한됩니다.</li>
            <li>수동 점심 오버라이드 시 해당 값이 우선 적용됩니다.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
