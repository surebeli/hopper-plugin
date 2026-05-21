export type TaskStatus = 'pending' | 'in-progress' | 'done' | 'failed' | 'removed' | 'orphan';

export interface Task {
  id: string;
  status: TaskStatus;
  brief: string;
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
