import { useQuery } from "@tanstack/react-query";
import ReactEChartsCore from "echarts-for-react";
import { useCallback, useEffect, useState } from "react";

interface StockItem {
  code: string;
  name: string;
  market: number;
  is_st: boolean;
}

interface KlineBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
}

interface StockIndicators {
  ma5: (number | null)[];
  ma10: (number | null)[];
  ma20: (number | null)[];
  ma60: (number | null)[];
  macd_dif: (number | null)[];
  macd_dea: (number | null)[];
  macd_hist: (number | null)[];
  kdj_k: (number | null)[];
  kdj_d: (number | null)[];
  kdj_j: (number | null)[];
}

interface StockDetail {
  stock: StockItem;
  klines: KlineBar[];
  indicators: StockIndicators;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function StockChart({ data }: { data: StockDetail }) {
  const dates = data.klines.map((k) => k.date);
  const ohlc = data.klines.map((k) => [k.open, k.close, k.low, k.high]);
  const volumes = data.klines.map((k) => k.volume);

  const option = {
    animation: false,
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    legend: {
      data: ["K线", "MA5", "MA10", "MA20", "MA60"],
      top: 0,
    },
    grid: [
      { left: 60, right: 20, top: 40, height: "45%" },
      { left: 60, right: 20, top: "60%", height: "15%" },
      { left: 60, right: 20, top: "78%", height: "15%" },
    ],
    xAxis: [
      {
        type: "category",
        data: dates,
        gridIndex: 0,
        axisLabel: { show: false },
      },
      {
        type: "category",
        data: dates,
        gridIndex: 1,
        axisLabel: { show: false },
      },
      { type: "category", data: dates, gridIndex: 2 },
    ],
    yAxis: [
      { type: "value", gridIndex: 0, scale: true },
      { type: "value", gridIndex: 1, scale: true, splitNumber: 2 },
      { type: "value", gridIndex: 2, scale: true, splitNumber: 2 },
    ],
    dataZoom: [{ type: "inside", xAxisIndex: [0, 1, 2], start: 60, end: 100 }],
    series: [
      {
        name: "K线",
        type: "candlestick",
        data: ohlc,
        xAxisIndex: 0,
        yAxisIndex: 0,
        itemStyle: {
          color: "#ef4444",
          color0: "#22c55e",
          borderColor: "#ef4444",
          borderColor0: "#22c55e",
        },
      },
      {
        name: "MA5",
        type: "line",
        data: data.indicators.ma5,
        xAxisIndex: 0,
        yAxisIndex: 0,
        smooth: true,
        lineStyle: { width: 1 },
        symbol: "none",
      },
      {
        name: "MA10",
        type: "line",
        data: data.indicators.ma10,
        xAxisIndex: 0,
        yAxisIndex: 0,
        smooth: true,
        lineStyle: { width: 1 },
        symbol: "none",
      },
      {
        name: "MA20",
        type: "line",
        data: data.indicators.ma20,
        xAxisIndex: 0,
        yAxisIndex: 0,
        smooth: true,
        lineStyle: { width: 1 },
        symbol: "none",
      },
      {
        name: "MA60",
        type: "line",
        data: data.indicators.ma60,
        xAxisIndex: 0,
        yAxisIndex: 0,
        smooth: true,
        lineStyle: { width: 1 },
        symbol: "none",
      },
      {
        name: "成交量",
        type: "bar",
        data: volumes,
        xAxisIndex: 1,
        yAxisIndex: 1,
        itemStyle: { color: "#6b7280" },
      },
      {
        name: "MACD",
        type: "bar",
        data: data.indicators.macd_hist.map((v) => ({
          value: v,
          itemStyle: { color: v && v >= 0 ? "#ef4444" : "#22c55e" },
        })),
        xAxisIndex: 2,
        yAxisIndex: 2,
      },
      {
        name: "DIF",
        type: "line",
        data: data.indicators.macd_dif,
        xAxisIndex: 2,
        yAxisIndex: 2,
        lineStyle: { width: 1 },
        symbol: "none",
      },
      {
        name: "DEA",
        type: "line",
        data: data.indicators.macd_dea,
        xAxisIndex: 2,
        yAxisIndex: 2,
        lineStyle: { width: 1 },
        symbol: "none",
      },
    ],
  };

  return <ReactEChartsCore option={option} style={{ height: 500 }} notMerge />;
}

function StockInfoBar({ data }: { data: StockDetail }) {
  const last = data.klines.length - 1;
  const prev = last > 0 ? last - 1 : 0;
  const bar = data.klines[last];
  const prevClose = data.klines[prev]?.close;
  const change = prevClose ? ((bar.close - prevClose) / prevClose) * 100 : 0;
  const ind = data.indicators;

  const items = [
    {
      label: "收盘",
      value: bar.close.toFixed(2),
      color: change >= 0 ? "text-red-500" : "text-green-500",
    },
    {
      label: "涨跌",
      value: `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`,
      color: change >= 0 ? "text-red-500" : "text-green-500",
    },
    { label: "成交额", value: `${(bar.amount / 1e8).toFixed(2)}亿` },
    { label: "MA5", value: ind.ma5[last]?.toFixed(2) ?? "-" },
    { label: "MA10", value: ind.ma10[last]?.toFixed(2) ?? "-" },
    { label: "MA20", value: ind.ma20[last]?.toFixed(2) ?? "-" },
    { label: "MA60", value: ind.ma60[last]?.toFixed(2) ?? "-" },
    { label: "DIF", value: ind.macd_dif[last]?.toFixed(4) ?? "-" },
    { label: "DEA", value: ind.macd_dea[last]?.toFixed(4) ?? "-" },
    {
      label: "MACD",
      value: ind.macd_hist[last]?.toFixed(4) ?? "-",
      color:
        (ind.macd_hist[last] ?? 0) >= 0 ? "text-red-500" : "text-green-500",
    },
  ];

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 rounded-md bg-muted/40 border border-border text-xs">
      {items.map((item) => (
        <span key={item.label}>
          <span className="text-muted-foreground">{item.label}</span>{" "}
          <span className={item.color ?? "font-mono"}>{item.value}</span>
        </span>
      ))}
    </div>
  );
}

function RecentDaysTable({ data }: { data: StockDetail }) {
  const recent = data.klines.slice(-10).reverse();
  const ind = data.indicators;
  const len = data.klines.length;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="px-3 py-2 bg-muted/30 border-b border-border">
        <span className="text-sm font-medium">近期行情</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/20">
            <tr>
              <th className="text-left px-2 py-1.5">日期</th>
              <th className="text-right px-2 py-1.5">开盘</th>
              <th className="text-right px-2 py-1.5">最高</th>
              <th className="text-right px-2 py-1.5">最低</th>
              <th className="text-right px-2 py-1.5">收盘</th>
              <th className="text-right px-2 py-1.5">涨跌%</th>
              <th className="text-right px-2 py-1.5">成交额</th>
              <th className="text-right px-2 py-1.5">MA5</th>
              <th className="text-right px-2 py-1.5">MA10</th>
              <th className="text-right px-2 py-1.5">MA20</th>
              <th className="text-right px-2 py-1.5">MACD</th>
              <th className="text-right px-2 py-1.5">KDJ-K</th>
              <th className="text-right px-2 py-1.5">KDJ-D</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((bar, i) => {
              const idx = len - 1 - i;
              const prevClose = idx > 0 ? data.klines[idx - 1].close : bar.open;
              const chg = ((bar.close - prevClose) / prevClose) * 100;
              return (
                <tr
                  key={bar.date}
                  className="border-t border-border hover:bg-muted/20"
                >
                  <td className="px-2 py-1 font-mono">{bar.date}</td>
                  <td className="px-2 py-1 text-right">
                    {bar.open.toFixed(2)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {bar.high.toFixed(2)}
                  </td>
                  <td className="px-2 py-1 text-right">{bar.low.toFixed(2)}</td>
                  <td
                    className={`px-2 py-1 text-right font-medium ${
                      chg >= 0 ? "text-red-500" : "text-green-500"
                    }`}
                  >
                    {bar.close.toFixed(2)}
                  </td>
                  <td
                    className={`px-2 py-1 text-right ${
                      chg >= 0 ? "text-red-500" : "text-green-500"
                    }`}
                  >
                    {chg >= 0 ? "+" : ""}
                    {chg.toFixed(2)}%
                  </td>
                  <td className="px-2 py-1 text-right">
                    {(bar.amount / 1e8).toFixed(2)}亿
                  </td>
                  <td className="px-2 py-1 text-right">
                    {ind.ma5[idx]?.toFixed(2) ?? "-"}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {ind.ma10[idx]?.toFixed(2) ?? "-"}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {ind.ma20[idx]?.toFixed(2) ?? "-"}
                  </td>
                  <td
                    className={`px-2 py-1 text-right ${
                      (ind.macd_hist[idx] ?? 0) >= 0
                        ? "text-red-500"
                        : "text-green-500"
                    }`}
                  >
                    {ind.macd_hist[idx]?.toFixed(4) ?? "-"}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {ind.kdj_k[idx]?.toFixed(1) ?? "-"}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {ind.kdj_d[idx]?.toFixed(1) ?? "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Stocks() {
  const [search, setSearch] = useState("");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data: listData } = useQuery({
    queryKey: ["stocks", search, page],
    queryFn: () =>
      fetchJson<{ total: number; items: StockItem[] }>(
        `/api/stocks?q=${encodeURIComponent(search)}&page=${page}&size=20`,
      ),
  });

  // Auto-select first stock on initial load
  useEffect(() => {
    if (!selectedCode && listData?.items.length) {
      setSelectedCode(listData.items[0].code);
    }
  }, [listData, selectedCode]);

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["stock-detail", selectedCode],
    queryFn: () =>
      fetchJson<StockDetail>(`/api/stocks/${selectedCode}?days=200`),
    enabled: !!selectedCode,
  });

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  }, []);

  return (
    <div
      className="flex flex-col gap-4"
      style={{ height: "calc(100vh - 48px)" }}
    >
      <h2 className="text-2xl font-bold shrink-0">股票数据</h2>

      <div className="flex gap-4 min-h-0 flex-1">
        {/* Left: Stock List */}
        <div className="w-72 shrink-0 flex flex-col gap-3">
          <input
            type="text"
            placeholder="搜索代码或名称..."
            value={search}
            onChange={handleSearch}
            className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
          />

          <div className="border border-border rounded-md overflow-hidden flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto">
              {listData?.items.map((s) => (
                <button
                  type="button"
                  key={s.code}
                  onClick={() => setSelectedCode(s.code)}
                  className={`w-full text-left px-3 py-1.5 text-sm border-b border-border hover:bg-muted/50 transition-colors ${
                    selectedCode === s.code ? "bg-primary/10" : ""
                  }`}
                >
                  <span className="font-mono text-xs">{s.code}</span>
                  <span className="ml-2">{s.name}</span>
                  {s.is_st && (
                    <span className="ml-1 text-xs text-red-500">ST</span>
                  )}
                </button>
              ))}
            </div>
            {listData && listData.total > 20 && (
              <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 text-xs border-t border-border">
                <span>
                  {(page - 1) * 20 + 1}-{Math.min(page * 20, listData.total)} /{" "}
                  {listData.total}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-2 py-0.5 border rounded disabled:opacity-30"
                  >
                    &lt;
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page * 20 >= listData.total}
                    className="px-2 py-0.5 border rounded disabled:opacity-30"
                  >
                    &gt;
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Chart (independent scroll) */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {selectedCode ? (
            detailLoading ? (
              <div className="flex items-center justify-center h-96 text-muted-foreground">
                加载中...
              </div>
            ) : detail ? (
              <div className="space-y-2">
                <div className="flex items-baseline gap-3">
                  <span className="text-lg font-bold">{detail.stock.name}</span>
                  <span className="font-mono text-muted-foreground">
                    {detail.stock.code}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {detail.stock.market === 0 ? "深圳" : "上海"}
                  </span>
                </div>
                <StockChart data={detail} />
                <StockInfoBar data={detail} />
                <RecentDaysTable data={detail} />
              </div>
            ) : null
          ) : (
            <div className="flex items-center justify-center h-96 text-muted-foreground">
              请从左侧选择一只股票查看K线图
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
