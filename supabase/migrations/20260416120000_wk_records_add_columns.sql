-- wk_records에 새 컬럼 추가: 사원번호, 근무조, 원본 휴일근무시간
ALTER TABLE public.wk_records
  ADD COLUMN IF NOT EXISTS employee_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS work_group TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_work_minutes INT;
