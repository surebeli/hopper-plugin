export const queryKeys = {
  queue: ['queue'] as const,
  vendors: ['vendors'] as const,
  cost: ['cost'] as const,
};

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`request failed: ${response.status}`);
  return response.json() as Promise<T>;
}
