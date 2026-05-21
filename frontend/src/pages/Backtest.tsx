import ReactECharts from "echarts-for-react";
import { useRef, useState } from "react";
import {
  type BacktestCreateParams,
  type BacktestDetail,
  type BacktestSummary,
  useBacktestDetail,
  useBacktestList,
  useCreateBacktest,
  useDeleteBacktest,
} from "../hooks/useBacktest";
import { useCustomStrategies } from "../hooks/useStrategies";

const PRESET_STRATEGIES: Record<string, { description: string; config: Record<string, unknown> }> = {
  "放量突破": {
    description: "均线多头排列 + 成交量放大 + MACD金叉",
    config: {
      layer1: { exclude_st: true, exclude_suspended: true, exclude_bse: true, exclude_star: true },
      layer2: { require_ma_aligned: true, ma_periods: [5, 10, 20, 60], require_trend_strong: false, require_di_bullish: true, min_adx: 0 },
      layer3: { min_amount: 2e8, min_volume_ratio: 1.5, require_macd_golden_cross: true, require_macd_positive: false, require_kdj_golden_cross: false, rsi_min: 40, rsi_max: 80 },
      layer4: { max_drawdown_limit: 15, max_consecutive_down: -3, max_bias: 10, min_bias: -15, wr_overbought: 20, boll_upper_limit: 0.95 },
    },
  },
  "缩量回调": {
    description: "趋势向上但短期缩量回调",
    config: {
      layer1: { exclude_st: true, exclude_suspended: true, exclude_bse: true, exclude_star: true },
      layer2: { require_ma_aligned: true, ma_periods: [5, 10, 20, 60], require_trend_strong: false, require_di_bullish: true, min_adx: 0 },
      layer3: { min_amount: 1e8, min_volume_ratio: 0, max_volume_ratio: 0.8, require_macd_golden_cross: false, require_macd_positive: true, require_kdj_golden_cross: false, rsi_min: 30, rsi_max: 55 },
      layer4: { max_drawdown_limit: 10, max_consecutive_down: -5, max_bias: 5, min_bias: -10, wr_overbought: 999, boll_upper_limit: 0.6 },
    },
  },
  "底部反转": {
    description: "超跌 + KDJ/MACD底部金叉",
    config: {
      layer1: { exclude_st: true, exclude_suspended: true, exclude_bse: true, exclude_star: true },
      layer2: { require_ma_aligned: false, ma_periods: [5, 10, 20, 60], require_trend_strong: false, require_di_bullish: false, min_adx: 0 },
      layer3: { min_amount: 1.5e8, min_volume_ratio: 1.2, require_macd_golden_cross: true, require_macd_positive: false, require_kdj_golden_cross: true, rsi_min: 15, rsi_max: 45 },
      layer4: { max_drawdown_limit: 30, max_consecutive_down: -8, max_bias: 0, min_bias: -20, wr_overbought: 999, boll_upper_limit: 0.4 },
    },
  },
  "均线粘合": {
    description: "MA5/10/20/60 价差收窄即将突破",
    config: {
      layer1: { exclude_st: true, exclude_suspended: true, exclude_bse: true, exclude_star: true },
      layer2: { require_ma_aligned: false, require_ma_converge: true, ma_converge_pct: 3.0, ma_periods: [5, 10, 20, 60], require_trend_strong: false, require_di_bullish: false, min_adx: 0 },
      layer3: { min_amount: 1.5e8, min_volume_ratio: 0, require_macd_golden_cross: false, require_macd_positive: false, require_kdj_golden_cross: false, rsi_min: 35, rsi_max: 65 },
      layer4: { max_drawdown_limit: 12, max_consecutive_down: -4, max_bias: 5, min_bias: -5, wr_overbought: 999, boll_upper_limit: 0.75 },
    },
  },
};

function HelpTooltip() {
  const [open, setOpen] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout>>();

  const show = () => { clearTimeout(timeout.current); setOpen(true); };
  const hide = () => { timeout.current = setTimeout(() => setOpen(false), 150); };

  return (
    <div className="relative inline-block" onMouseEnter={show} onMouseLeave={hide}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-5 h-5 rounded-full border border-border text-muted-foreground text-xs flex items-center justify-center hover:bg-muted/50 transition-colors"
        aria-label="使用帮助"
      >
        ?
      </button>
      {open && (
        <div className="absolute left-0 top-7 z-50 w-80 rounded-lg border border-border bg-background shadow-lg p-4 text-sm space-y-2">
          <p className="font-semibold">如何使用回测</p>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>选择一个<span className="text-foreground font-medium">策略模板</span>（如"放量突破"）</li>
            <li>设置回测的<span className="text-foreground font-medium">起止日期</span></li>
            <li>调整止盈、止损比例和最大持仓天数</li>
            <li>点击<span className="text-foreground font-medium">"开始回测"</span>，等待计算完成</li>
            <li>查看权益曲线、绩效指标和交易明细</li>
          </ol>
          <div className="border-t border-border pt-2 mt-2 text-xs text-muted-foreground space-y-1">
            <p><span className="font-medium text-foreground">交易规则：</span>信号当天收盘产生，次日开盘价买入</p>
            <p><span className="font-medium text-foreground">卖出条件：</span>止盈/止损/持仓到期，先到先触发</p>
            <p><span className="font-medium text-foreground">仓位管理：</span>等权分配，每只股票买入手数取整为100的整数倍</p>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, suffix = "", color = "" }: { label: string; value: string | number | null; suffix?: string; color?: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>
        {value != null ? `${value}${suffix}` : "-"}
      </p>
    </div>
  );
}

function EquityChart({ detail }: { detail: BacktestDetail }) {
  if (!detail.equity_curve || detail.equity_curve.length === 0) return null;

  const dates = detail.equity_curve.map((p) => p.date);
  const equities = detail.equity_curve.map((p) => p.equity);

  // Normalize to percentage returns
  const initial = equities[0] || detail.initial_capital;
  const returns = equities.map((e) => ((e - initial) / initial) * 100);

  const option = {
    tooltip: {
      trigger: "axis",
      formatter: (params: { name: string; value: number }[]) => {
        const p = params[0];
        return `${p.name}<br/>收益率: ${p.value.toFixed(2)}%`;
      },
    },
    grid: { left: "8%", right: "4%", top: "10%", bottom: "12%" },
    xAxis: {
      type: "category",
      data: dates,
      axisLabel: { fontSize: 10, rotate: 30 },
    },
    yAxis: {
      type: "value",
      axisLabel: { formatter: "{value}%" },
    },
    series: [
      {
        name: "收益率",
        type: "line",
        data: returns,
        smooth: true,
        lineStyle: { width: 2 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(59, 130, 246, 0.3)" },
              { offset: 1, color: "rgba(59, 130, 246, 0.02)" },
            ],
          },
        },
        itemStyle: { color: "#3b82f6" },
        showSymbol: false,
      },
    ],
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <h4 className="font-semibold mb-2">权益曲线</h4>
      <ReactECharts option={option} style={{ height: 300 }} />
    </div>
  );
}

function TradesTable({ trades }: { trades: BacktestDetail["trades"] }) {
  if (!trades || trades.length === 0) return null;

  const reasonMap: Record<string, string> = {
    take_profit: "止盈",
    stop_loss: "止损",
    max_hold: "到期",
    end_of_backtest: "回测结束",
  };

  return (
    <div className="rounded-lg border border-border">
      <div className="p-4 border-b border-border">
        <h4 className="font-semibold">交易记录 ({trades.length} 笔)</h4>
      </div>
      <div className="overflow-x-auto max-h-96">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="text-left p-3">代码</th>
              <th className="text-left p-3">名称</th>
              <th className="text-left p-3">买入日</th>
              <th className="text-right p-3">买入价</th>
              <th className="text-left p-3">卖出日</th>
              <th className="text-right p-3">卖出价</th>
              <th className="text-right p-3">盈亏%</th>
              <th className="text-right p-3">持有天数</th>
              <th className="text-center p-3">卖出原因</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id} className="border-t border-border hover:bg-muted/30">
                <td className="p-3 font-mono">{t.stock_code}</td>
                <td className="p-3">{t.stock_name}</td>
                <td className="p-3">{t.buy_date}</td>
                <td className="p-3 text-right">{t.buy_price.toFixed(2)}</td>
                <td className="p-3">{t.sell_date ?? "-"}</td>
                <td className="p-3 text-right">{t.sell_price?.toFixed(2) ?? "-"}</td>
                <td className={`p-3 text-right font-medium ${(t.pnl_pct ?? 0) > 0 ? "text-red-500" : (t.pnl_pct ?? 0) < 0 ? "text-green-500" : ""}`}>
                  {t.pnl_pct != null ? `${(t.pnl_pct * 100).toFixed(2)}%` : "-"}
                </td>
                <td className="p-3 text-right">{t.hold_days}</td>
                <td className="p-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    t.sell_reason === "take_profit" ? "bg-red-100 text-red-700" :
                    t.sell_reason === "stop_loss" ? "bg-green-100 text-green-700" :
                    "bg-gray-100 text-gray-700"
                  }`}>
                    {t.sell_reason ? (reasonMap[t.sell_reason] || t.sell_reason) : "-"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BacktestResult({ id }: { id: string }) {
  const { data: detail, isLoading } = useBacktestDetail(id);

  if (isLoading || !detail) {
    return <div className="text-muted-foreground py-4">加载回测结果...</div>;
  }

  if (detail.status === "running" || detail.status === "pending") {
    return (
      <div className="rounded-lg border border-border p-8 text-center">
        <div className="animate-pulse text-primary font-medium">回测运行中...</div>
        <p className="text-sm text-muted-foreground mt-2">请稍候，正在模拟历史交易</p>
      </div>
    );
  }

  if (detail.status === "failed") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        回测失败，请检查日志
      </div>
    );
  }

  const totalReturnPct = detail.total_return != null ? (detail.total_return * 100).toFixed(2) : null;
  const annualReturnPct = detail.annual_return != null ? (detail.annual_return * 100).toFixed(2) : null;
  const maxDrawdownPct = detail.max_drawdown != null ? (detail.max_drawdown * 100).toFixed(2) : null;
  const winRatePct = detail.win_rate != null ? (detail.win_rate * 100).toFixed(1) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="总收益"
          value={totalReturnPct}
          suffix="%"
          color={(detail.total_return ?? 0) >= 0 ? "text-red-500" : "text-green-500"}
        />
        <MetricCard
          label="年化收益"
          value={annualReturnPct}
          suffix="%"
          color={(detail.annual_return ?? 0) >= 0 ? "text-red-500" : "text-green-500"}
        />
        <MetricCard label="最大回撤" value={maxDrawdownPct} suffix="%" color="text-green-500" />
        <MetricCard label="夏普比率" value={detail.sharpe_ratio?.toFixed(2) ?? null} />
        <MetricCard label="胜率" value={winRatePct} suffix="%" />
        <MetricCard label="总交易" value={`${detail.profit_trades}/${detail.total_trades}`} />
      </div>

      <EquityChart detail={detail} />
      <TradesTable trades={detail.trades} />
    </div>
  );
}

export default function Backtest() {
  const { data: backtests } = useBacktestList();
  const createMutation = useCreateBacktest();
  const deleteMutation = useDeleteBacktest();
  const { data: customStrategies } = useCustomStrategies();

  const [selectedPreset, setSelectedPreset] = useState<string>("放量突破");
  const [selectedCustomId, setSelectedCustomId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState("2024-01-01");
  const [endDate, setEndDate] = useState("2024-06-30");
  const [takeProfit, setTakeProfit] = useState(10);
  const [stopLoss, setStopLoss] = useState(5);
  const [maxHoldDays, setMaxHoldDays] = useState(5);
  const [maxPositions, setMaxPositions] = useState(10);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const handleRun = () => {
    let strategyName: string;
    let strategyConfig: Record<string, unknown>;

    if (selectedCustomId != null) {
      const custom = customStrategies?.find((s) => s.id === selectedCustomId);
      if (!custom) return;
      strategyName = custom.name;
      strategyConfig = custom.config;
    } else {
      const preset = PRESET_STRATEGIES[selectedPreset];
      if (!preset) return;
      strategyName = selectedPreset;
      strategyConfig = preset.config;
    }

    const params: BacktestCreateParams = {
      name: `${strategyName} ${startDate}~${endDate}`,
      strategy_config: strategyConfig,
      start_date: startDate,
      end_date: endDate,
      initial_capital: 1_000_000,
      take_profit: takeProfit / 100,
      stop_loss: stopLoss / 100,
      max_hold_days: maxHoldDays,
      max_positions: maxPositions,
    };

    createMutation.mutate(params, {
      onSuccess: (data: BacktestSummary) => {
        setSelectedRunId(data.id);
      },
    });
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case "pending": return "等待中";
      case "running": return "运行中";
      case "done": return "已完成";
      case "failed": return "失败";
      default: return s;
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "pending": return "bg-yellow-100 text-yellow-700";
      case "running": return "bg-blue-100 text-blue-700";
      case "done": return "bg-green-100 text-green-700";
      case "failed": return "bg-red-100 text-red-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">回测分析</h2>
        <HelpTooltip />
      </div>

      {/* Config Panel */}
      <div className="rounded-lg border border-border p-4 space-y-4">
        <h3 className="font-semibold">回测配置</h3>

        {/* Strategy Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">策略模板</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(PRESET_STRATEGIES).map(([name, preset]) => (
              <button
                key={name}
                type="button"
                onClick={() => { setSelectedPreset(name); setSelectedCustomId(null); }}
                className={`p-3 rounded-lg border text-left transition-all hover:shadow-sm ${
                  selectedCustomId == null && selectedPreset === name
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <p className="font-medium text-sm">{name}</p>
                <p className="text-xs text-muted-foreground mt-1">{preset.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Strategies */}
        {customStrategies && customStrategies.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium">我的策略</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {customStrategies.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setSelectedCustomId(s.id); }}
                  className={`p-3 rounded-lg border text-left transition-all hover:shadow-sm ${
                    selectedCustomId === s.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <p className="font-medium text-sm">{s.name}</p>
                  {s.description && (
                    <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Parameters */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">开始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2 py-1.5 border border-border rounded text-sm bg-background"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">结束日期</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-2 py-1.5 border border-border rounded text-sm bg-background"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">止盈 (%)</label>
            <input
              type="number"
              value={takeProfit}
              onChange={(e) => setTakeProfit(Number(e.target.value))}
              min={1}
              max={100}
              step={1}
              className="w-full px-2 py-1.5 border border-border rounded text-sm bg-background"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">止损 (%)</label>
            <input
              type="number"
              value={stopLoss}
              onChange={(e) => setStopLoss(Number(e.target.value))}
              min={1}
              max={50}
              step={1}
              className="w-full px-2 py-1.5 border border-border rounded text-sm bg-background"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">最大持仓天数</label>
            <input
              type="number"
              value={maxHoldDays}
              onChange={(e) => setMaxHoldDays(Number(e.target.value))}
              min={1}
              max={60}
              step={1}
              className="w-full px-2 py-1.5 border border-border rounded text-sm bg-background"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">最大持仓数</label>
            <input
              type="number"
              value={maxPositions}
              onChange={(e) => setMaxPositions(Number(e.target.value))}
              min={1}
              max={50}
              step={1}
              className="w-full px-2 py-1.5 border border-border rounded text-sm bg-background"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleRun}
          disabled={createMutation.isPending}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {createMutation.isPending ? "创建中..." : "开始回测"}
        </button>

        {createMutation.isError && (
          <p className="text-sm text-red-500">
            {(createMutation.error as Error).message}
          </p>
        )}
      </div>

      {/* History List */}
      {backtests && backtests.length > 0 && (
        <div className="rounded-lg border border-border">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold">回测历史</h3>
          </div>
          <div className="divide-y divide-border">
            {backtests.map((bt) => (
              <div
                key={bt.id}
                className={`p-4 flex items-center justify-between hover:bg-muted/30 cursor-pointer transition-colors ${
                  selectedRunId === bt.id ? "bg-primary/5" : ""
                }`}
                onClick={() => setSelectedRunId(bt.id)}
                onKeyDown={(e) => e.key === "Enter" && setSelectedRunId(bt.id)}
              >
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-medium text-sm">{bt.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {bt.start_date} ~ {bt.end_date}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${statusColor(bt.status)}`}>
                    {statusLabel(bt.status)}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  {bt.status === "done" && bt.total_return != null && (
                    <span className={`text-sm font-medium ${bt.total_return >= 0 ? "text-red-500" : "text-green-500"}`}>
                      {(bt.total_return * 100).toFixed(2)}%
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (selectedRunId === bt.id) setSelectedRunId(null);
                      deleteMutation.mutate(bt.id);
                    }}
                    className="text-xs text-muted-foreground hover:text-red-500 px-2 py-1"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Result Display */}
      {selectedRunId && <BacktestResult id={selectedRunId} />}
    </div>
  );
}
