-- 주말근무 테이블 5종

CREATE TABLE public.wk_sites (
  name TEXT NOT NULL PRIMARY KEY,
  lunch_minutes INT NOT NULL DEFAULT 60,
  department TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wk_employees (
  name TEXT NOT NULL PRIMARY KEY,
  site TEXT,
  organization TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wk_records (
  key TEXT NOT NULL PRIMARY KEY,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  organization TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '',
  schedule TEXT NOT NULL DEFAULT '',
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  site TEXT,
  stay_minutes INT NOT NULL DEFAULT 0,
  lunch_minutes INT NOT NULL DEFAULT 0,
  work_minutes INT NOT NULL DEFAULT 0,
  warnings JSONB NOT NULL DEFAULT '[]',
  manual_override BOOLEAN NOT NULL DEFAULT false,
  lunch_override INT,
  upload_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wk_records_date ON public.wk_records(date);
CREATE INDEX idx_wk_records_name ON public.wk_records(name);

CREATE TABLE public.wk_uploads (
  id TEXT NOT NULL PRIMARY KEY,
  filename TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_count INT NOT NULL DEFAULT 0,
  valid_rows INT NOT NULL DEFAULT 0
);

CREATE TABLE public.wk_config (
  key TEXT NOT NULL PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.wk_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wk_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wk_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wk_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wk_config ENABLE ROW LEVEL SECURITY;

-- Policies (anon 전체 허용 — 내부 도구)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['wk_sites','wk_employees','wk_records','wk_uploads','wk_config'] LOOP
    EXECUTE format('CREATE POLICY "anon read" ON public.%I FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY "anon insert" ON public.%I FOR INSERT WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "anon delete" ON public.%I FOR DELETE USING (true)', t);
    EXECUTE format('CREATE POLICY "anon update" ON public.%I FOR UPDATE USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
