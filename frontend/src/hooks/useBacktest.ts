import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface BacktestTradeItem {
  id: number;
  stock_code: string;
  stock_name: string;
  buy_date: string;
  buy_price: number;
  sell_date: string | null;
  sell_price: number | null;
  sell_reason: string | null;
  pnl: number | null;
  pnl_pct: number | null;
  hold_days: number;
}

export interface BacktestSummary {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  initial_capital: number;
  take_profit: number;
  stop_loss: number;
  max_hold_days: number;
  max_positions: number;
  total_return: number | null;
  annual_return: number | null;
  max_drawdown: number | null;
  sharpe_ratio: number | null;
  win_rate: number | null;
  total_trades: number;
  profit_trades: number;
  duration_seconds: number | null;
  created_at: string;
}

export interface EquityCurvePoint {
  date: string;
  equity: number;
  benchmark: number | null;
}

export interface BacktestDetail extends BacktestSummary {
  strategy_config: Record<string, unknown>;
  equity_curve: EquityCurvePoint[];
  trades: BacktestTradeItem[];
}

export interface BacktestCreateParams {
  name: string;
  strategy_config: Record<string, unknown>;
  start_date: string;
  end_date: string;
  initial_capital: number;
  take_profit: number;
  stop_loss: number;
  max_hold_days: number;
  max_positions: number;
}

export function useBacktestList() {
  return useQuery<BacktestSummary[]>({
    queryKey: ["backtests"],
    queryFn: () => fetchJson("/api/backtest"),
    refetchInterval: 5000,
  });
}

export function useBacktestDetail(id: string | null) {
  return useQuery<BacktestDetail>({
    queryKey: ["backtest", id],
    queryFn: () => fetchJson(`/api/backtest/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && (data.status === "done" || data.status === "failed")) return false;
      return 3000;
    },
  });
}

export function useCreateBacktest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: BacktestCreateParams) => {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      return res.json() as Promise<BacktestSummary>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backtests"] });
    },
  });
}

export function useDeleteBacktest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/backtest/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backtests"] });
    },
  });
}

export function useCleanupBacktests() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/backtest/cleanup", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ cleaned: number }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backtests"] });
    },
  });
}
