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

export interface SectorMemberItem {
  stock_code: string;
  stock_name: string;
  close: number | null;
  pct_change: number | null;
  amount: number | null;
  volume_ratio: number | null;
  ma_aligned: boolean;
}

export interface SectorMembersResponse {
  sector: SectorItem;
  total: number;
  items: SectorMemberItem[];
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

export interface SectorMembersParams {
  sectorId: number | null;
  page: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  maAlignedOnly?: boolean;
}

export function useSectorMembers({ sectorId, page, sortBy = "amount", sortOrder = "desc", maAlignedOnly = false }: SectorMembersParams) {
  return useQuery<SectorMembersResponse>({
    queryKey: ["sector-members", sectorId, page, sortBy, sortOrder, maAlignedOnly],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        size: "30",
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      if (maAlignedOnly) params.set("ma_aligned_only", "true");
      return fetchJson(`/api/sectors/${sectorId}/members?${params}`);
    },
    enabled: sectorId !== null,
  });
}
