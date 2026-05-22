export type TaskStatus = 'pending' | 'in-progress' | 'done' | 'failed' | 'removed';

export interface Task {
  id: string;
  taskType: string;
  status: TaskStatus;
  depends: string[];
  priority: 'high' | 'normal' | 'low';
  brief: string;
  vendor: string | null;
}

export type FrontmatterValue = string | number | boolean | null;

export interface TaskDetail {
  id: string;
  frontmatter: Record<string, FrontmatterValue>;
  body: string;
}

export type ProgressEvent = {
  seq: number;
  ts: string;
  task_id: string;
  vendor: string;
  phase: string;
  kind: string;
  message: string;
  source: string;
  terminal: boolean;
  status?: string;
  duration_ms?: number;
  exit_code?: number;
  signal?: string | null;
  adapter_status?: string;
  timed_out?: boolean | null;
};

export interface TaskProgressResponse {
  id: string;
  events: ProgressEvent[];
}

export interface Vendor {
  name: string;
  installStatus: 'installed' | 'cached' | 'unknown';
  binaryPath: string | null;
  cachedAt: string | null;
  cachedModels: string[];
  cacheError: string | null;
  introspection: string | null;
  modelsSource: string | null;
  notes: string[];
  reasoningLevels: string[];
  stale: boolean;
  staleness: string;
}

export interface VendorsResponse {
  vendors: Vendor[];
  cacheError: string | null;
  generatedAt: string;
}

export interface ProbeResponse {
  vendor: string;
  status: 'done';
  exitCode: number;
  signal: string | null;
  stdout: string;
  stderr: string;
}

export interface CostRow {
  date: string;
  task: string;
  role: string;
  model: string;
  vendor: string;
  tokensIn: number;
  tokensOut: number;
  approxUsd: number;
  tier: string;
  notes: string;
}

export interface CostTotals {
  rows: number;
  tokensIn: number;
  tokensOut: number;
  approxUsd: number;
}

export interface CostByVendor {
  vendor: string;
  tokensIn: number;
  tokensOut: number;
  approxUsd: number;
  count: number;
}

export interface CostResponse {
  rows: CostRow[];
  totals: CostTotals;
  byVendor: CostByVendor[];
}
