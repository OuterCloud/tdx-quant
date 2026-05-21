import { useQuery } from "@tanstack/react-query";

const BASE = "/api/dashboard";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface MarketOverview {
  total_stocks: number;
  trading_stocks: number;
  st_stocks: number;
  data_updated_at: string | null;
}

export interface TodaySummary {
  screen_date: string;
  total_screened: number;
  layer1_passed: number;
  layer2_passed: number;
}

export interface BuyListItem {
  stock_code: string;
  stock_name: string;
  close: number | null;
  amount: number | null;
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  ma60: number | null;
  macd_hist: number | null;
  macd_golden_cross: boolean;
  score: number;
}

export interface DataStatus {
  has_data: boolean;
  total_files: number;
  last_task_status: string | null;
  last_task_time: string | null;
  is_busy: boolean;
}

export function useMarketOverview() {
  return useQuery<MarketOverview>({
    queryKey: ["market-overview"],
    queryFn: () => fetchJson(`${BASE}/market-overview`),
    refetchInterval: 30000,
  });
}

export function useTodaySummary() {
  return useQuery<TodaySummary>({
    queryKey: ["today-summary"],
    queryFn: () => fetchJson(`${BASE}/today-summary`),
    refetchInterval: 30000,
  });
}

export function useBuyList() {
  return useQuery<BuyListItem[]>({
    queryKey: ["buy-list"],
    queryFn: () => fetchJson(`${BASE}/buy-list`),
    refetchInterval: 30000,
  });
}

export function useDataStatus() {
  return useQuery<DataStatus>({
    queryKey: ["data-status"],
    queryFn: () => fetchJson(`${BASE}/data-status`),
    refetchInterval: 5000,
  });
}
