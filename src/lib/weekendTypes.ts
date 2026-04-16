export interface WkSite {
  name: string;
  lunchMinutes: number;
  department: string;
}

export interface WkEmployee {
  name: string;
  site: string | null;
  organization: string;
  position: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface WkRecord {
  key: string;
  date: string;
  name: string;
  organization: string;
  position: string;
  schedule: string;
  checkIn: string | null;
  checkOut: string | null;
  site: string | null;
  stayMinutes: number;
  lunchMinutes: number;
  workMinutes: number;
  warnings: string[];
  manualOverride: boolean;
  lunchOverride: number | null;
  uploadId: string | null;
}

export interface WkUpload {
  id: string;
  filename: string;
  periodStart: string;
  periodEnd: string;
  uploadedAt: string;
  rowCount: number;
  validRows: number;
}

export interface WkPreset {
  id: string;
  name: string;
  mapping: Record<string, string>;
  createdAt: string;
}

export interface WkReportConfig {
  defaultDepartment: string;
  approvalLine: string;
}

export interface WkMonthlyReport {
  notes: string;
  attachmentCount: number;
  updatedAt: string;
}

export interface WkState {
  sites: Record<string, WkSite>;
  employees: Record<string, WkEmployee>;
  records: Record<string, WkRecord>;
  uploads: WkUpload[];
  presets: WkPreset[];
  monthlyReports: Record<string, WkMonthlyReport>;
  reportConfig: WkReportConfig;
}

export interface UploadPreparation {
  newRecords: WkRecord[];
  warnings: { rec: WkRecord; issues: string[] }[];
  newEmployees: Set<string>;
  overlaps: { filename: string; period: { start: string; end: string }; overlap: WkUpload[] }[];
  files: {
    filename: string;
    rows: Record<string, unknown>[];
    period: { start: string; end: string };
    uploadId: string;
    records: WkRecord[];
  }[];
}
