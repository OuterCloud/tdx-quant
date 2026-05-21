import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface SectorItem {
  id: number;
  code: string;
  name: string;
  board_type: string;
  stock_count: number;
}

export interface SectorSyncStatus {
  concept_count: number;
  synced_at: string | null;
  is_syncing: boolean;
}

export function useSectors() {
  return useQuery<SectorItem[]>({
    queryKey: ["sectors"],
    queryFn: () => fetchJson("/api/sectors"),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useSectorSyncStatus() {
  return useQuery<SectorSyncStatus>({
    queryKey: ["sector-sync-status"],
    queryFn: () => fetchJson("/api/sectors/sync-status"),
    refetchInterval: 5000,
  });
}

export function useSectorSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sectors/sync", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sector-sync-status"] });
      qc.invalidateQueries({ queryKey: ["sectors"] });
    },
  });
}
