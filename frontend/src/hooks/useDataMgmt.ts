import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

async function postAction(url: string) {
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface TaskDetail {
  id: string;
  task_type: string;
  status: string;
  progress: number;
  total: number;
  message: string | null;
  created_at: string;
  finished_at: string | null;
}

export function useInitData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postAction("/api/data/init"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["data-status"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useUpdateData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postAction("/api/data/update"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["data-status"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useTasks() {
  return useQuery<TaskDetail[]>({
    queryKey: ["tasks"],
    queryFn: () => fetchJson("/api/data/tasks"),
    refetchInterval: 5000,
  });
}

export function useCancelTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => postAction(`/api/data/tasks/${taskId}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["data-status"] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const res = await fetch(`/api/data/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["data-status"] });
    },
  });
}

export function useCleanupTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postAction("/api/data/tasks/cleanup"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["data-status"] });
    },
  });
}
