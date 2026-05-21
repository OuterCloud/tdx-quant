import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface CustomStrategy {
  id: number;
  name: string;
  description: string;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useCustomStrategies() {
  return useQuery<CustomStrategy[]>({
    queryKey: ["custom-strategies"],
    queryFn: () => fetchJson("/api/strategies"),
  });
}

export function useSaveStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { name: string; description?: string }) => {
      const res = await fetch("/api/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      return res.json() as Promise<CustomStrategy>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-strategies"] });
    },
  });
}

export function useUpdateStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: number;
      name?: string;
      description?: string;
      config?: Record<string, unknown>;
    }) => {
      const res = await fetch(`/api/strategies/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      return res.json() as Promise<CustomStrategy>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-strategies"] });
    },
  });
}

export function useDeleteStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/strategies/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-strategies"] });
    },
  });
}

export function useApplyStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/strategies/${id}/apply`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["screening-config"] });
    },
  });
}
