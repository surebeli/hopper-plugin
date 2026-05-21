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
  installed: boolean;
  stale: boolean;
}

export interface CostRow {
  task: string;
  vendor: string;
  tokens: number;
  dollars: number;
}
