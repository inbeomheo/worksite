import { useCallback, useRef, useState } from "react";
import { Upload, X, AlertTriangle, Check } from "lucide-react";
import type { UploadPreparation } from "@/lib/weekendTypes";
import WeekendStatCard from "./WeekendStatCard";

interface Props {
  onPrepare: (files: File[]) => Promise<UploadPreparation>;
  onApply: (prep: UploadPreparation) => Promise<void>;
}

export default function WeekendFileUpload({ onPrepare, onApply }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [prep, setPrep] = useState<UploadPreparation | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setIsPreparing(true);
      try {
        const result = await onPrepare(files);
        setPrep(result);
      } finally {
        setIsPreparing(false);
      }
    },
    [onPrepare]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.name.match(/\.(xlsx|xls)$/i)
      );
      handleFiles(files);
    },
    [handleFiles]
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      handleFiles(files);
      // reset input so same file can be re-selected
      e.target.value = "";
    },
    [handleFiles]
  );

  const handleApply = useCallback(async () => {
    if (!prep) return;
    setIsApplying(true);
    try {
      await onApply(prep);
      setPrep(null);
      setIsOpen(false);
    } finally {
      setIsApplying(false);
    }
  }, [prep, onApply]);

  const handleCancel = useCallback(() => {
    setPrep(null);
  }, []);

  const handleClose = useCallback(() => {
    setPrep(null);
    setIsOpen(false);
  }, []);

  const newEmployeesArr = prep ? Array.from(prep.newEmployees) : [];

  return (
    <>
      {/* 트리거 버튼 */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <Upload className="h-4 w-4" />
        엑셀 업로드
      </button>

      {/* 모달 오버레이 */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="relative w-full max-w-lg mx-4 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-border overflow-hidden">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold">주말 공수 엑셀 업로드</h2>
              <button
                onClick={handleClose}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* 드래그앤드롭 존 (prep 없을 때) */}
              {!prep && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  onClick={() => inputRef.current?.click()}
                  className={`relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-12 cursor-pointer transition-colors ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/30 hover:border-primary/50"
                  }`}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    multiple
                    onChange={onInputChange}
                    className="hidden"
                  />
                  {isPreparing ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <p className="text-sm text-muted-foreground">파일 분석 중...</p>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <div className="text-center">
                        <p className="text-sm font-medium text-foreground">
                          엑셀 파일을 드래그하거나 클릭하여 업로드
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          .xlsx / .xls 파일, 여러 파일 동시 업로드 가능
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 검증 리포트 */}
              {prep && (
                <div className="space-y-4">
                  {/* 통계 카드 4개 */}
                  <div className="grid grid-cols-2 gap-3">
                    <WeekendStatCard
                      label="파일 수"
                      value={prep.files.length}
                      icon="📂"
                    />
                    <WeekendStatCard
                      label="레코드 수"
                      value={prep.newRecords.length}
                      icon="📋"
                    />
                    <WeekendStatCard
                      label="경고 수"
                      value={prep.warnings.length}
                      icon="⚠️"
                    />
                    <WeekendStatCard
                      label="신규 직원"
                      value={newEmployeesArr.length}
                      icon="👤"
                    />
                  </div>

                  {/* 기간 중복 경고 */}
                  {prep.overlaps.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                          기간 중복 감지 ({prep.overlaps.length}건)
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {prep.overlaps.map((ov, i) => (
                          <li key={i} className="text-xs text-amber-700 dark:text-amber-400">
                            <span className="font-medium">{ov.filename}</span>
                            {" "}({ov.period.start} ~ {ov.period.end}) — 기존{" "}
                            {ov.overlap.map((u) => u.filename).join(", ")}와 중복
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 신규 직원 목록 */}
                  {newEmployeesArr.length > 0 && (
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        신규 직원 ({newEmployeesArr.length}명) — 자동 등록됩니다
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {newEmployeesArr.map((name) => (
                          <span
                            key={name}
                            className="inline-flex items-center rounded-full bg-purple-100 dark:bg-purple-900/40 px-2.5 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 푸터 버튼 */}
            {prep && (
              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border bg-muted/20">
                <button
                  onClick={handleCancel}
                  disabled={isApplying}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  onClick={handleApply}
                  disabled={isApplying}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isApplying ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                      반영 중...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      반영
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
