import type { WkUpload } from "@/lib/weekendTypes";

interface Props {
  uploads: WkUpload[];
  onDelete: (id: string) => void;
}

export default function WeekendUploads({ uploads, onDelete }: Props) {
  const sorted = [...uploads].sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">
          총 {uploads.length}건 업로드됨
        </span>
        <span className="text-xs text-gray-400">
          업로드 삭제 시 해당 파일의 근무 기록도 함께 삭제됩니다.
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">업로드 이력 없음</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-3 py-2 font-medium text-gray-600">파일명</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">기간</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">전체행</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">반영행</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">업로드시각</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((upload) => (
                <tr key={upload.id} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-2 max-w-[200px] truncate" title={upload.filename}>
                    {upload.filename}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {upload.periodStart} ~ {upload.periodEnd}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">{upload.rowCount}</td>
                  <td className="px-3 py-2 text-right font-bold">{upload.validRows}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {new Date(upload.uploadedAt).toLocaleString("ko-KR", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            `"${upload.filename}" 업로드를 삭제하시겠습니까?\n해당 파일의 근무 기록도 삭제됩니다.`
                          )
                        ) {
                          onDelete(upload.id);
                        }
                      }}
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
      )}
    </div>
  );
}
