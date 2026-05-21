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
  task: string;
  vendor: string;
  tokens: number;
  dollars: number;
}
