import type { CostResponse, ProbeResponse, Task, TaskDetail, VendorsResponse } from './types';

export const queryKeys = {
  queue: ['queue'] as const,
  task: (id: string) => ['task', id] as const,
  vendors: ['vendors'] as const,
  cost: ['cost'] as const,
};

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  if (!response.ok) throw new Error(`request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export function fetchQueue() {
  return fetchJson<Task[]>('/api/queue');
}

export function fetchTask(id: string) {
  return fetchJson<TaskDetail>(`/api/task/${encodeURIComponent(id)}`);
}

export function fetchVendors() {
  return fetchJson<VendorsResponse>('/api/vendors');
}

export function fetchCost() {
  return fetchJson<CostResponse>('/api/cost');
}

export function probeVendor(vendor: string) {
  return postJson<ProbeResponse>('/api/action/probe', { vendor });
}
