import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import type { WkEmployee, WkRecord, WkSite } from "@/lib/weekendTypes";
import { fmtMin } from "@/lib/weekendCalc";

interface Props {
  employees: Record<string, WkEmployee>;
  records: Record<string, WkRecord>;
  sites: Record<string, WkSite>;
  onUpdateEmployee: (name: string, updates: Partial<WkEmployee>) => void;
  onDeleteEmployee: (name: string) => void;
  onBulkAssign: (site: string) => void;
}

export default function WeekendEmployees({
  employees,
  records,
  sites,
  onUpdateEmployee,
  onDeleteEmployee,
  onBulkAssign,
}: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const siteNames = Object.keys(sites);

  const statsMap = useMemo(() => {
    const map: Record<string, { days: number; minutes: number }> = {};
    for (const rec of Object.values(records)) {
      if (!map[rec.name]) map[rec.name] = { days: 0, minutes: 0 };
      map[rec.name].days += 1;
      map[rec.name].minutes += rec.workMinutes;
    }
    return map;
  }, [records]);

  const unassignedCount = Object.values(employees).filter((e) => !e.site).length;

  const filtered = useMemo(() => {
    return Object.values(employees)
      .filter((e) => {
        if (search && !e.name.includes(search) && !e.organization.includes(search)) return false;
        if (filter === "unassigned") return !e.site;
        if (filter !== "all") return e.site === filter;
        return true;
      })
      .sort((a, b) => {
        const aAssigned = !!a.site;
        const bAssigned = !!b.site;
        if (aAssigned !== bAssigned) return aAssigned ? 1 : -1;
        const aMin = statsMap[a.name]?.minutes ?? 0;
        const bMin = statsMap[b.name]?.minutes ?? 0;
        return bMin - aMin;
      });
  }, [employees, search, filter, statsMap]);

  function handleBulkAssign() {
    const site = window.prompt("일괄 지정할 현장명을 입력하세요:");
    if (site && site.trim()) {
      onBulkAssign(site.trim());
    }
  }

  return (
    <div className="space-y-4">
      {unassignedCount > 0 && (
        <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-md px-4 py-2 text-sm">
          현장 미지정 직원이 {unassignedCount}명 있습니다. 현장을 지정해야 근무시간이 집계됩니다.
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="이름 또는 조직 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 border rounded-md text-sm w-full"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border rounded-md px-2 py-1.5 text-sm"
        >
          <option value="all">전체</option>
          <option value="unassigned">미지정</option>
          {siteNames.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          onClick={handleBulkAssign}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          일괄 지정
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left px-3 py-2 font-medium text-gray-600">이름</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">조직</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">직급</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">현장</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">근무일</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">근무시간</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">메모</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-6 text-gray-400">
                  해당하는 직원이 없습니다.
                </td>
              </tr>
            )}
            {filtered.map((emp) => {
              const stats = statsMap[emp.name] ?? { days: 0, minutes: 0 };
              return (
                <tr key={emp.name} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-2">{emp.name}</td>
                  <td className="px-3 py-2 text-gray-600">{emp.organization}</td>
                  <td className="px-3 py-2 text-gray-600">{emp.position}</td>
                  <td className="px-3 py-2">
                    <select
                      value={emp.site ?? ""}
                      onChange={(e) =>
                        onUpdateEmployee(emp.name, { site: e.target.value || null })
                      }
                      className="border rounded px-2 py-1 text-sm w-full min-w-[100px]"
                    >
                      <option value="">미지정</option>
                      {siteNames.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">{stats.days}</td>
                  <td className="px-3 py-2 text-right font-bold">{fmtMin(stats.minutes)}</td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={emp.note}
                      onChange={(e) => onUpdateEmployee(emp.name, { note: e.target.value })}
                      className="border rounded px-2 py-1 text-sm w-full"
                      placeholder="메모"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => {
                        if (window.confirm(`"${emp.name}" 직원을 삭제하시겠습니까?`)) {
                          onDeleteEmployee(emp.name);
                        }
                      }}
                      className="text-red-500 hover:text-red-700 text-sm px-2 py-1"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
