import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { SectorSelector } from "../components/ui/SectorSelector";
import { StockTable, type ColumnDef } from "../components/ui/StockTable";
import {
  useApplyStrategy,
  useCustomStrategies,
  useDeleteStrategy,
  useSaveStrategy,
  useUpdateStrategy,
} from "../hooks/useStrategies";
import { useWebSocket } from "../hooks/useWebSocket";

interface SectorFilter {
  mode: "include" | "exclude" | "disabled";
  sector_ids: number[];
}

interface Layer1Config {
  exclude_st: boolean;
  exclude_suspended: boolean;
  exclude_bse: boolean;
  exclude_star: boolean;
  sector_filter?: SectorFilter;
}

interface Layer2Config {
  require_ma_aligned: boolean;
  require_ma_converge: boolean;
  ma_converge_pct: number;
  ma_periods: number[];
  require_trend_strong: boolean;
  require_di_bullish: boolean;
  min_adx: number;
}

interface Layer3Config {
  min_amount: number;
  min_volume_ratio: number;
  max_volume_ratio: number;
  require_macd_golden_cross: boolean;
  require_macd_positive: boolean;
  require_kdj_golden_cross: boolean;
  rsi_min: number;
  rsi_max: number;
}

interface Layer4Config {
  max_drawdown_limit: number;
  max_consecutive_down: number;
  max_bias: number;
  min_bias: number;
  wr_overbought: number;
  boll_upper_limit: number;
}

interface ScreeningConfig {
  active_preset: string | null;
  layer1: Layer1Config;
  layer2: Layer2Config;
  layer3: Layer3Config;
  layer4: Layer4Config;
}

interface ScreeningResultItem {
  stock_code: string;
  stock_name: string;
  close: number | null;
  amount: number | null;
  pct_change: number | null;
  volume_ratio: number | null;
  rsi14: number | null;
  macd_hist: number | null;
  macd_golden_cross: boolean;
  kdj_golden_cross: boolean;
  ma_aligned: boolean;
  boll_position: number | null;
  max_drawdown_20d: number | null;
  score: number;
}

interface PresetStrategy {
  description: string;
  config: {
    layer1: Layer1Config;
    layer2: Layer2Config;
    layer3: Layer3Config;
    layer4: Layer4Config;
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function formatAmount(amount: number | null): string {
  if (amount == null) return "-";
  return `${(amount / 1e8).toFixed(2)}亿`;
}

function NumInput({
  value,
  onChange,
  step = 1,
  min,
  max,
  className = "",
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
}) {
  return (
    <input
      type="number"
      step={step}
      min={min}
      max={max}
      value={value}
      onChange={(e) => {
        const v = Number.parseFloat(e.target.value);
        if (!Number.isNaN(v)) onChange(v);
      }}
      className={`w-20 px-2 py-1 border border-border rounded text-sm bg-background ${className}`}
    />
  );
}

function Tip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  const handleEnter = () => {
    setShow(true);
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const tipWidth = 208; // w-52 = 13rem = 208px
      let left = rect.left + rect.width / 2 - tipWidth / 2;
      // Clamp to viewport
      if (left < 8) left = 8;
      if (left + tipWidth > window.innerWidth - 8)
        left = window.innerWidth - 8 - tipWidth;
      setStyle({
        top: rect.top - 6,
        left,
        transform: "translateY(-100%)",
      });
    }
  };

  return (
    <span
      ref={triggerRef}
      className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-muted-foreground/40 text-[9px] text-muted-foreground cursor-help hover:bg-muted/50 align-middle ml-1 relative -top-px"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
    >
      ?
      {show && (
        <span
          className="fixed w-52 px-2.5 py-1.5 rounded bg-foreground text-background text-[11px] leading-relaxed shadow-lg z-[9999] pointer-events-none whitespace-normal text-left font-normal"
          style={style}
        >
          {text}
        </span>
      )}
    </span>
  );
}

function StepIndicator({
  label,
  status,
}: {
  label: string;
  status: "pending" | "active" | "done";
}) {
  return (
    <div className="flex items-center gap-2">
      {status === "active" && (
        <span className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      )}
      {status === "done" && (
        <span className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center text-white text-[10px]">
          ✓
        </span>
      )}
      {status === "pending" && (
        <span className="w-4 h-4 rounded-full border-2 border-border" />
      )}
      <span
        className={
          status === "active"
            ? "text-blue-700 font-medium"
            : status === "done"
            ? "text-green-700"
            : "text-muted-foreground"
        }
      >
        {label}
      </span>
    </div>
  );
}

function ScreeningHelp() {
  const [open, setOpen] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout>>();

  const show = () => {
    clearTimeout(timeout.current);
    setOpen(true);
  };
  const hide = () => {
    timeout.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
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
          <p className="font-semibold">选股策略使用说明</p>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>
              选择一个
              <span className="text-foreground font-medium">策略模板</span>
              ，或手动展开各层调整参数
            </li>
            <li>
              点击右上角
              <span className="text-foreground font-medium">"运行选股"</span>
              按钮
            </li>
            <li>系统会对全市场股票进行4层筛选</li>
            <li>筛选结果展示在下方表格中，按得分排序</li>
          </ol>
          <div className="border-t border-border pt-2 mt-2 text-xs text-muted-foreground space-y-1">
            <p>
              <span className="font-medium text-foreground">4层漏斗：</span>
            </p>
            <p>L1 基础过滤 → L2 趋势确认 → L3 量价择时 → L4 风控过滤</p>
            <p className="mt-1">
              <span className="font-medium text-foreground">提示：</span>
              修改任何参数会自动保存并切换为自定义模式
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function SaveConfigDialog({
  open,
  onClose,
  onSaveNew,
  onOverwrite,
  isPending,
  error,
  existingStrategies,
}: {
  open: boolean;
  onClose: () => void;
  onSaveNew: (name: string, description: string) => void;
  onOverwrite: (id: number) => void;
  isPending: boolean;
  error: string | null;
  existingStrategies: { id: number; name: string; description: string }[];
}) {
  const [mode, setMode] = useState<"new" | "overwrite">(
    existingStrategies.length > 0 ? "overwrite" : "new",
  );
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(
    existingStrategies[0]?.id ?? null,
  );

  useEffect(() => {
    if (open) {
      setMode(existingStrategies.length > 0 ? "overwrite" : "new");
      setName("");
      setDesc("");
      setSelectedId(existingStrategies[0]?.id ?? null);
    }
  }, [open, existingStrategies]);

  if (!open) return null;

  const canSubmit = mode === "new" ? !!name.trim() : selectedId != null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background border border-border rounded-lg shadow-xl p-6 w-[420px] space-y-4">
        <h3 className="font-semibold text-lg">保存当前配置</h3>

        {/* Mode Tabs */}
        <div className="flex border border-border rounded-md overflow-hidden text-sm">
          {existingStrategies.length > 0 && (
            <button
              type="button"
              onClick={() => setMode("overwrite")}
              className={`flex-1 px-4 py-2 transition-colors ${
                mode === "overwrite"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted/50"
              }`}
            >
              覆盖已有策略
            </button>
          )}
          <button
            type="button"
            onClick={() => setMode("new")}
            className={`flex-1 px-4 py-2 transition-colors ${
              mode === "new"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted/50"
            }`}
          >
            另存为新策略
          </button>
        </div>

        {/* Content */}
        {mode === "overwrite" && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">选择要覆盖的策略：</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {existingStrategies.map((s) => (
                <label
                  key={s.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedId === s.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="overwrite-target"
                    checked={selectedId === s.id}
                    onChange={() => setSelectedId(s.id)}
                    className="accent-primary"
                  />
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    {s.description && (
                      <p className="text-xs text-muted-foreground">
                        {s.description}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {mode === "new" && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium block mb-1">策略名称</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                placeholder="输入策略名称"
                className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">
                描述（可选）
              </label>
              <input
                type="text"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="简短描述策略特点"
                className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
              />
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted/50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              if (mode === "new") onSaveNew(name.trim(), desc.trim());
              else if (selectedId != null) onOverwrite(selectedId);
            }}
            disabled={!canSubmit || isPending}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50 hover:opacity-90"
          >
            {isPending ? "保存中..." : mode === "new" ? "保存" : "覆盖"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditStrategyDialog({
  open,
  onClose,
  onSave,
  isPending,
  error,
  initialName,
  initialDesc,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
  isPending: boolean;
  error: string | null;
  initialName?: string;
  initialDesc?: string;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [desc, setDesc] = useState(initialDesc ?? "");

  useEffect(() => {
    if (open) {
      setName(initialName ?? "");
      setDesc(initialDesc ?? "");
    }
  }, [open, initialName, initialDesc]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background border border-border rounded-lg shadow-xl p-6 w-96 space-y-4">
        <h3 className="font-semibold text-lg">编辑策略</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium block mb-1">策略名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              placeholder="输入策略名称"
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">
              描述（可选）
            </label>
            <input
              type="text"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="简短描述策略特点"
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted/50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onSave(name.trim(), desc.trim())}
            disabled={!name.trim() || isPending}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50 hover:opacity-90"
          >
            {isPending ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ShareDialog({
  open,
  onClose,
  config,
  results,
  presets,
  customStrategies,
}: {
  open: boolean;
  onClose: () => void;
  config: ScreeningConfig;
  results:
    | { total: number; screen_date: string; items: ScreeningResultItem[] }
    | undefined;
  presets: Record<string, PresetStrategy> | undefined;
  customStrategies:
    | { id: number; name: string; description: string }[]
    | undefined;
}) {
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  if (!open) return null;

  const date = results?.screen_date ?? new Date().toISOString().slice(0, 10);
  const topStocks = results?.items?.slice(0, 10) ?? [];
  const avgScore =
    topStocks.length > 0
      ? topStocks.reduce((a, b) => a + b.score, 0) / topStocks.length
      : 0;
  const risingCount = topStocks.filter(
    (s) => s.pct_change != null && s.pct_change > 0,
  ).length;
  const maAlignedCount = topStocks.filter((s) => s.ma_aligned).length;
  const goldenCrossCount = topStocks.filter(
    (s) => s.macd_golden_cross || s.kdj_golden_cross,
  ).length;

  // Strategy name
  let strategyName = "自定义参数";
  let strategyDesc = "";
  if (config.active_preset) {
    if (config.active_preset.startsWith("custom:")) {
      const cs = customStrategies?.find(
        (s) => s.id === Number(config.active_preset!.slice(7)),
      );
      strategyName = cs?.name ?? "自定义策略";
      strategyDesc = cs?.description ?? "";
    } else {
      strategyName = config.active_preset;
      strategyDesc = presets?.[config.active_preset]?.description ?? "";
    }
  }

  // Layer summaries
  const l1Tags: string[] = [];
  if (config.layer1.exclude_st) l1Tags.push("排除ST");
  if (config.layer1.exclude_suspended) l1Tags.push("排除停牌");
  if (config.layer1.exclude_bse) l1Tags.push("排除北交所");
  if (config.layer1.exclude_star) l1Tags.push("排除科创板");
  const sf = config.layer1.sector_filter;
  if (sf && sf.mode !== "disabled" && sf.sector_ids.length > 0) {
    l1Tags.push(
      `板块${sf.mode === "include" ? "包含" : "排除"}${sf.sector_ids.length}个`,
    );
  }

  const l2Tags: string[] = [];
  if (config.layer2.require_ma_aligned) l2Tags.push("均线多头");
  if (config.layer2.require_ma_converge)
    l2Tags.push(`粘合≤${config.layer2.ma_converge_pct}%`);
  if (config.layer2.require_trend_strong) l2Tags.push("强趋势");
  if (config.layer2.require_di_bullish) l2Tags.push("DI看多");
  if (config.layer2.min_adx > 0) l2Tags.push(`ADX≥${config.layer2.min_adx}`);

  const l3Tags: string[] = [];
  l3Tags.push(`成交≥${(config.layer3.min_amount / 1e8).toFixed(1)}亿`);
  if (config.layer3.min_volume_ratio > 0)
    l3Tags.push(`量比≥${config.layer3.min_volume_ratio}`);
  if (config.layer3.require_macd_golden_cross) l3Tags.push("MACD金叉");
  if (config.layer3.require_macd_positive) l3Tags.push("MACD为正");
  if (config.layer3.require_kdj_golden_cross) l3Tags.push("KDJ金叉");
  l3Tags.push(`RSI ${config.layer3.rsi_min}-${config.layer3.rsi_max}`);

  const l4Tags: string[] = [];
  l4Tags.push(`回撤≤${config.layer4.max_drawdown_limit}%`);
  l4Tags.push(`连跌≤${Math.abs(config.layer4.max_consecutive_down)}天`);
  l4Tags.push(`乖离${config.layer4.min_bias}~${config.layer4.max_bias}%`);
  l4Tags.push(`BOLL≤${(config.layer4.boll_upper_limit * 100).toFixed(0)}%`);

  const handleCopy = async () => {
    if (!cardRef.current) return;
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Screenshot copy failed:", e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background border border-border rounded-lg shadow-xl w-[680px] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-semibold text-lg">分享选股结果</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-muted/50 text-muted-foreground"
          >
            x
          </button>
        </div>

        {/* Scrollable card area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div
            ref={cardRef}
            className="bg-white rounded-xl p-6 space-y-5 text-[13px] text-gray-800 leading-relaxed"
          >
            {/* Title */}
            <div className="text-center space-y-1">
              <h2 className="text-lg font-bold text-gray-900">量化选股报告</h2>
              <p className="text-xs text-gray-500">
                {date} | 策略: {strategyName}
              </p>
              {strategyDesc && (
                <p className="text-xs text-gray-400">{strategyDesc}</p>
              )}
            </div>

            {/* Strategy Params - 4 columns */}
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-blue-50 rounded-lg p-3 space-y-1.5">
                <div className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide">
                  L1 基础过滤
                </div>
                <div className="flex flex-wrap gap-1">
                  {l1Tags.map((t) => (
                    <span
                      key={t}
                      className="inline-block px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="bg-green-50 rounded-lg p-3 space-y-1.5">
                <div className="text-[11px] font-semibold text-green-700 uppercase tracking-wide">
                  L2 趋势确认
                </div>
                <div className="flex flex-wrap gap-1">
                  {l2Tags.length > 0 ? (
                    l2Tags.map((t) => (
                      <span
                        key={t}
                        className="inline-block px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px]"
                      >
                        {t}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] text-green-600">无限制</span>
                  )}
                </div>
              </div>
              <div className="bg-orange-50 rounded-lg p-3 space-y-1.5">
                <div className="text-[11px] font-semibold text-orange-700 uppercase tracking-wide">
                  L3 量价择时
                </div>
                <div className="flex flex-wrap gap-1">
                  {l3Tags.map((t) => (
                    <span
                      key={t}
                      className="inline-block px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="bg-red-50 rounded-lg p-3 space-y-1.5">
                <div className="text-[11px] font-semibold text-red-700 uppercase tracking-wide">
                  L4 风控过滤
                </div>
                <div className="flex flex-wrap gap-1">
                  {l4Tags.map((t) => (
                    <span
                      key={t}
                      className="inline-block px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Results summary bar */}
            <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
              <span className="font-semibold text-gray-900">
                筛选结果: {results?.total ?? 0} 只通过
              </span>
              <div className="flex gap-4 text-[11px] text-gray-600">
                <span>
                  均分 <b className="text-gray-900">{avgScore.toFixed(1)}</b>
                </span>
                <span>
                  上涨{" "}
                  <b className="text-gray-900">
                    {risingCount}/{topStocks.length}
                  </b>
                </span>
                <span>
                  多头{" "}
                  <b className="text-gray-900">
                    {maAlignedCount}/{topStocks.length}
                  </b>
                </span>
                <span>
                  金叉{" "}
                  <b className="text-gray-900">
                    {goldenCrossCount}/{topStocks.length}
                  </b>
                </span>
              </div>
            </div>

            {/* Stock table */}
            {topStocks.length > 0 && (
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-gray-600">
                    <th className="text-left py-2 px-2.5 font-medium rounded-tl-md">
                      代码
                    </th>
                    <th className="text-left py-2 px-2.5 font-medium">名称</th>
                    <th className="text-right py-2 px-2.5 font-medium">
                      收盘价
                    </th>
                    <th className="text-right py-2 px-2.5 font-medium">
                      涨跌%
                    </th>
                    <th className="text-right py-2 px-2.5 font-medium">
                      成交额
                    </th>
                    <th className="text-right py-2 px-2.5 font-medium">量比</th>
                    <th className="text-center py-2 px-2.5 font-medium">
                      信号
                    </th>
                    <th className="text-right py-2 px-2.5 font-medium rounded-tr-md">
                      得分
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topStocks.map((s, i) => (
                    <tr
                      key={s.stock_code}
                      className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                    >
                      <td className="py-1.5 px-2.5 font-mono text-gray-700">
                        {s.stock_code}
                      </td>
                      <td className="py-1.5 px-2.5 font-medium text-gray-900">
                        {s.stock_name}
                      </td>
                      <td className="py-1.5 px-2.5 text-right">
                        {s.close?.toFixed(2) ?? "-"}
                      </td>
                      <td
                        className={`py-1.5 px-2.5 text-right font-medium ${
                          s.pct_change != null && s.pct_change > 0
                            ? "text-red-600"
                            : s.pct_change != null && s.pct_change < 0
                            ? "text-green-600"
                            : ""
                        }`}
                      >
                        {s.pct_change != null
                          ? `${
                              s.pct_change > 0 ? "+" : ""
                            }${s.pct_change.toFixed(2)}%`
                          : "-"}
                      </td>
                      <td className="py-1.5 px-2.5 text-right">
                        {s.amount != null
                          ? `${(s.amount / 1e8).toFixed(2)}亿`
                          : "-"}
                      </td>
                      <td className="py-1.5 px-2.5 text-right">
                        {s.volume_ratio?.toFixed(2) ?? "-"}
                      </td>
                      <td className="py-1.5 px-2.5 text-center">
                        <span className="inline-flex gap-0.5">
                          {s.ma_aligned && (
                            <span className="text-[9px] px-1 py-0.5 bg-green-100 text-green-700 rounded">
                              多
                            </span>
                          )}
                          {s.macd_golden_cross && (
                            <span className="text-[9px] px-1 py-0.5 bg-yellow-100 text-yellow-700 rounded">
                              M
                            </span>
                          )}
                          {s.kdj_golden_cross && (
                            <span className="text-[9px] px-1 py-0.5 bg-purple-100 text-purple-700 rounded">
                              K
                            </span>
                          )}
                          {!s.ma_aligned &&
                            !s.macd_golden_cross &&
                            !s.kdj_golden_cross && (
                              <span className="text-gray-300">-</span>
                            )}
                        </span>
                      </td>
                      <td className="py-1.5 px-2.5 text-right font-bold text-blue-700">
                        {s.score.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Indicator Legend */}
            <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-2">
              <div className="font-semibold text-gray-700 text-[11px]">
                指标说明
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px] text-gray-600">
                <div>
                  <b className="text-gray-800">得分</b>
                  ：综合技术评分，≥10分信号强烈，6-10分中等偏多，&lt;6分偏弱
                </div>
                <div>
                  <b className="text-gray-800">量比</b>
                  ：当日成交量/过去5日均量，&gt;1放量活跃，&lt;1缩量观望，&gt;2显著放量
                </div>
                <div>
                  <b className="text-gray-800">成交额</b>
                  ：当日总成交金额，越高流动性越好，通常≥1亿为活跃标的
                </div>
                <div>
                  <b className="text-gray-800">涨跌%</b>
                  ：当日收盘价相对前一日的涨跌幅度
                </div>
                <div>
                  <b className="text-gray-800">信号</b>：
                  <span className="inline-block mx-0.5 px-1 py-0.5 bg-green-100 text-green-700 rounded text-[9px]">
                    多
                  </span>
                  均线多头排列（短期均线在上，趋势向好）
                  <span className="inline-block mx-0.5 px-1 py-0.5 bg-yellow-100 text-yellow-700 rounded text-[9px]">
                    M
                  </span>
                  MACD金叉（动能转强）
                  <span className="inline-block mx-0.5 px-1 py-0.5 bg-purple-100 text-purple-700 rounded text-[9px]">
                    K
                  </span>
                  KDJ金叉（短线超卖回升）
                </div>
                <div>
                  <b className="text-gray-800">四层漏斗</b>
                  ：L1基础过滤→L2趋势确认→L3量价择时→L4风控校验，逐层收窄精选个股
                </div>
              </div>
            </div>

            {/* Analysis */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg px-4 py-3">
              <div className="font-semibold text-gray-800 mb-1">综合评价</div>
              <p className="text-[12px] text-gray-600">
                {avgScore >= 10
                  ? "市场信号偏强，入选股票趋势明确、量价配合良好，可积极关注。"
                  : avgScore >= 6
                  ? "市场信号中性，部分个股技术面较好，建议结合基本面和板块热度进一步筛选。"
                  : "市场信号偏弱，符合条件的标的较少，建议观望或降低仓位，等待更明确的入场信号。"}
              </p>
            </div>

            {/* Footer */}
            <div className="text-center text-[10px] text-gray-400 pt-2 border-t border-gray-100">
              由 TDX量化选股系统 自动生成 | 仅供参考，不构成投资建议
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted/50"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
          >
            {copied ? "已复制到剪贴板" : "一键复制为图片"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Screening() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null);

  // Custom strategies
  const { data: customStrategies } = useCustomStrategies();
  const saveStrategyMut = useSaveStrategy();
  const updateStrategyMut = useUpdateStrategy();
  const deleteStrategyMut = useDeleteStrategy();
  const applyStrategyMut = useApplyStrategy();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<{
    id: number;
    name: string;
    description: string;
  } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);

  const { data: config, isLoading: configLoading } = useQuery<ScreeningConfig>({
    queryKey: ["screening-config"],
    queryFn: () => fetchJson("/api/screening/config"),
  });

  const { data: presets } = useQuery<Record<string, PresetStrategy>>({
    queryKey: ["screening-presets"],
    queryFn: () => fetchJson("/api/screening/presets"),
  });

  const { data: results } = useQuery<{
    total: number;
    screen_date: string;
    items: ScreeningResultItem[];
  }>({
    queryKey: ["screening-results", page],
    queryFn: () => fetchJson(`/api/screening/results?page=${page}&size=30`),
    refetchInterval: 10000,
  });

  const saveMutation = useMutation({
    mutationFn: async (cfg: ScreeningConfig) => {
      const res = await fetch("/api/screening/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error("Save failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["screening-config"] }),
  });

  const applyPresetMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(
        `/api/screening/apply-preset/${encodeURIComponent(name)}`,
        {
          method: "POST",
        },
      );
      if (!res.ok) throw new Error("Apply preset failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["screening-config"] }),
  });

  const [screeningStatus, setScreeningStatus] = useState<
    "idle" | "indicators" | "filtering" | "done" | "error"
  >("idle");
  const { messages: wsMessages } = useWebSocket("/ws/logs");

  const [doneMessage, setDoneMessage] = useState("");

  // Listen for screening progress messages
  const lastMsgCount = useRef(0);
  useEffect(() => {
    if (wsMessages.length <= lastMsgCount.current) return;
    const newMsgs = wsMessages.slice(lastMsgCount.current);
    lastMsgCount.current = wsMessages.length;

    for (const msg of newMsgs) {
      if (msg.includes("[screening:start]")) setScreeningStatus("indicators");
      else if (msg.includes("[screening:indicators]"))
        setScreeningStatus("indicators");
      else if (msg.includes("[screening:filtering]"))
        setScreeningStatus("filtering");
      else if (msg.includes("[screening:done]")) {
        setScreeningStatus("done");
        // Extract stats from message like "[screening:done] 筛选完成: 5208只 → L1:4599 → L2:829 → L3:1 → L4:0"
        const match = msg.match(
          /(\d+)只 → L1:(\d+) → L2:(\d+) → L3:(\d+) → L4:(\d+)/,
        );
        if (match) {
          setDoneMessage(
            `${match[1]}只股票 → 基础过滤:${match[2]} → 趋势确认:${match[3]} → 量价择时:${match[4]} → 风控过滤:${match[5]}`,
          );
        } else {
          setDoneMessage("筛选完成");
        }
        qc.invalidateQueries({ queryKey: ["screening-results"] });
      } else if (msg.includes("[screening:error]")) setScreeningStatus("error");
    }
  }, [wsMessages, qc]);

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/screening/run", { method: "POST" });
      if (!res.ok) throw new Error("Run failed");
      return res.json();
    },
    onSuccess: () => {
      setScreeningStatus("indicators");
    },
  });

  const isRunning =
    screeningStatus === "indicators" || screeningStatus === "filtering";

  const updateConfig = (partial: Partial<ScreeningConfig>) => {
    if (!config) return;
    const newConfig = { ...config, ...partial, active_preset: null };
    saveMutation.mutate(newConfig);
  };

  const toggleLayer = (layer: string) => {
    setExpandedLayer(expandedLayer === layer ? null : layer);
  };

  const screeningColumns: ColumnDef<ScreeningResultItem>[] = [
    {
      key: "code",
      title: "代码",
      render: (r) => <span className="font-mono">{r.stock_code}</span>,
    },
    { key: "name", title: "名称", render: (r) => r.stock_name },
    {
      key: "close",
      title: "收盘价",
      align: "right",
      tip: "最新交易日的收盘价格",
      render: (r) => r.close?.toFixed(2) ?? "-",
    },
    {
      key: "pct",
      title: "涨跌%",
      align: "right",
      tip: "当日涨跌幅。红色为上涨，绿色为下跌。涨幅过大可能面临回调风险",
      render: (r) =>
        r.pct_change != null ? (
          <span
            className={
              r.pct_change > 0
                ? "text-red-500"
                : r.pct_change < 0
                ? "text-green-500"
                : ""
            }
          >
            {r.pct_change > 0 ? "+" : ""}
            {r.pct_change.toFixed(2)}%
          </span>
        ) : (
          "-"
        ),
    },
    {
      key: "amount",
      title: "成交额",
      align: "right",
      tip: "当日总成交金额（亿元）。越高说明资金关注度越高、流动性越好，一般 >2亿 为活跃",
      render: (r) => formatAmount(r.amount),
    },
    {
      key: "vol_ratio",
      title: "量比",
      align: "right",
      tip: "当日成交量 / 近5日平均成交量。>1.5 放量（资金涌入，积极信号），<0.8 缩量（观望），>3 异常放量需警惕",
      render: (r) => r.volume_ratio?.toFixed(2) ?? "-",
    },
    {
      key: "rsi",
      title: "RSI",
      align: "right",
      tip: "相对强弱指标(14日)。<30 超卖可能反弹（买入机会），>70 超买可能回调（风险），40-60 为中性健康区间",
      render: (r) => r.rsi14?.toFixed(1) ?? "-",
    },
    {
      key: "macd",
      title: "MACD柱",
      align: "right",
      tip: "MACD柱状图值。正值且增大=多头动能增强（好），负值且缩小=空头减弱即将反转，数值越大趋势越强",
      render: (r) => r.macd_hist?.toFixed(4) ?? "-",
    },
    {
      key: "ma",
      title: "均线",
      align: "center",
      tip: "均线多头排列状态。'多'表示MA5>MA10>MA20>MA60，是典型上涨趋势，'-'表示未形成多头排列",
      render: (r) =>
        r.ma_aligned ? (
          <span className="text-green-500 font-medium">多</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: "cross",
      title: "金叉",
      align: "center",
      tip: "技术指标金叉信号。M=MACD金叉（中线买入信号），K=KDJ金叉（短线买入信号），同时出现金叉共振更强",
      render: (r) => (
        <div className="flex gap-1 justify-center">
          {r.macd_golden_cross && (
            <span className="text-xs px-1 bg-yellow-100 text-yellow-700 rounded">
              M
            </span>
          )}
          {r.kdj_golden_cross && (
            <span className="text-xs px-1 bg-purple-100 text-purple-700 rounded">
              K
            </span>
          )}
          {!r.macd_golden_cross && !r.kdj_golden_cross && "-"}
        </div>
      ),
    },
    {
      key: "boll",
      title: "BOLL位",
      align: "right",
      tip: "股价在布林带中的相对位置。0%=下轨（超卖），50%=中轨，100%=上轨（超买）。20-80%为健康区间",
      render: (r) =>
        r.boll_position != null
          ? `${(r.boll_position * 100).toFixed(0)}%`
          : "-",
    },
    {
      key: "drawdown",
      title: "回撤%",
      align: "right",
      tip: "近20日最大回撤幅度。越小越好，<10%说明走势稳健，>20%说明近期有大幅下跌，追高风险大",
      render: (r) => r.max_drawdown_20d?.toFixed(1) ?? "-",
    },
    {
      key: "score",
      title: "得分",
      align: "right",
      tip: "综合评分（满分约20分）。>15分：非常强势；10-15分：较好；5-10分：一般；<5分：较弱",
      render: (r) => (
        <span className="font-semibold">{r.score.toFixed(1)}</span>
      ),
    },
  ];

  if (configLoading) {
    return <div className="text-muted-foreground">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">选股策略</h2>
          <ScreeningHelp />
        </div>
        <button
          type="button"
          onClick={() => runMutation.mutate()}
          disabled={isRunning || runMutation.isPending}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {isRunning ? "运行中..." : "运行选股"}
        </button>
      </div>

      {/* Progress Steps */}
      {isRunning && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
          <div className="flex items-center gap-6 text-sm">
            <StepIndicator
              label="计算指标"
              status={
                screeningStatus === "indicators"
                  ? "active"
                  : screeningStatus === "filtering"
                  ? "done"
                  : "pending"
              }
            />
            <div className="h-px w-8 bg-border" />
            <StepIndicator
              label="4层筛选"
              status={screeningStatus === "filtering" ? "active" : "pending"}
            />
            <div className="h-px w-8 bg-border" />
            <StepIndicator label="完成" status="pending" />
          </div>
        </div>
      )}

      {screeningStatus === "done" && (
        <div className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded-md space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-medium">筛选完成</span>
            <button
              type="button"
              onClick={() => setScreeningStatus("idle")}
              className="text-xs underline"
            >
              关闭
            </button>
          </div>
          {doneMessage && (
            <p className="text-xs text-green-700/80">{doneMessage}</p>
          )}
        </div>
      )}

      {screeningStatus === "error" && (
        <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md flex items-center justify-between">
          <span>选股失败，请查看日志</span>
          <button
            type="button"
            onClick={() => setScreeningStatus("idle")}
            className="text-xs underline"
          >
            关闭
          </button>
        </div>
      )}

      {/* Preset Strategies */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="font-semibold">策略模板</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {presets &&
            Object.entries(presets).map(([name, preset]) => (
              <button
                key={name}
                type="button"
                onClick={() => applyPresetMutation.mutate(name)}
                className={`p-3 rounded-lg border text-left transition-all hover:shadow-sm ${
                  config?.active_preset === name
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <p className="font-medium text-sm">{name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {preset.description}
                </p>
              </button>
            ))}
        </div>
        {!config?.active_preset && (
          <p className="text-xs text-muted-foreground">
            当前为自定义模式（点击上方模板可快速切换回预设策略）
          </p>
        )}
      </div>

      {/* Custom Strategies */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">我的策略</h3>
          <button
            type="button"
            onClick={() => {
              setSaveError(null);
              setShowSaveDialog(true);
            }}
            className="px-3 py-1.5 text-xs border border-primary text-primary rounded-md hover:bg-primary/5 transition-colors"
          >
            + 保存当前配置
          </button>
        </div>
        {customStrategies && customStrategies.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {customStrategies.map((s) => {
              const isActive = config?.active_preset === `custom:${s.id}`;
              return (
                <div
                  key={s.id}
                  className={`p-3 rounded-lg border transition-all group relative cursor-pointer ${
                    isActive
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => applyStrategyMut.mutate(s.id)}
                >
                  <p className="font-medium text-sm pr-10">{s.name}</p>
                  {s.description && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {s.description}
                    </p>
                  )}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSaveError(null);
                        setEditingStrategy({
                          id: s.id,
                          name: s.name,
                          description: s.description,
                        });
                      }}
                      className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:bg-muted/50 text-xs"
                      title="编辑"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`确定删除策略「${s.name}」？`)) {
                          deleteStrategyMut.mutate(s.id);
                        }
                      }}
                      className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-500 text-xs"
                      title="删除"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            暂无自定义策略，调整参数后可保存为自己的策略
          </p>
        )}
      </div>

      {/* Save Config Dialog */}
      <SaveConfigDialog
        open={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onSaveNew={(name, description) => {
          setSaveError(null);
          saveStrategyMut.mutate(
            { name, description },
            {
              onSuccess: () => setShowSaveDialog(false),
              onError: (err) => setSaveError(err.message),
            },
          );
        }}
        onOverwrite={(id) => {
          if (!config) return;
          setSaveError(null);
          const { active_preset: _, ...layers } = config;
          updateStrategyMut.mutate(
            { id, config: layers },
            {
              onSuccess: () => setShowSaveDialog(false),
              onError: (err) => setSaveError(err.message),
            },
          );
        }}
        isPending={saveStrategyMut.isPending || updateStrategyMut.isPending}
        error={saveError}
        existingStrategies={
          customStrategies?.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
          })) ?? []
        }
      />

      {/* Edit Dialog */}
      <EditStrategyDialog
        open={!!editingStrategy}
        onClose={() => setEditingStrategy(null)}
        onSave={(name, description) => {
          if (!editingStrategy) return;
          setSaveError(null);
          updateStrategyMut.mutate(
            { id: editingStrategy.id, name, description },
            {
              onSuccess: () => setEditingStrategy(null),
              onError: (err) => setSaveError(err.message),
            },
          );
        }}
        isPending={updateStrategyMut.isPending}
        error={saveError}
        initialName={editingStrategy?.name}
        initialDesc={editingStrategy?.description}
      />

      {/* 4-Layer Config */}
      {config?.active_preset && (
        <p className="text-sm text-muted-foreground bg-muted/30 px-3 py-2 rounded-md">
          已使用「
          {config.active_preset.startsWith("custom:")
            ? customStrategies?.find(
                (s) => s.id === Number(config.active_preset!.slice(7)),
              )?.name ?? "自定义策略"
            : config.active_preset}
          」模板配置，可直接运行选股。如需微调参数，展开下方面板修改。
        </p>
      )}
      <div className="space-y-3">
        {/* Layer 1 */}
        <div className="rounded-lg border border-border">
          <button
            type="button"
            onClick={() => toggleLayer("layer1")}
            className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                1
              </span>
              <span className="font-semibold text-sm">基础过滤</span>
              <span className="text-xs text-muted-foreground">
                排除 ST、停牌、特定板块
              </span>
            </div>
            <span className="text-muted-foreground">
              {expandedLayer === "layer1" ? "−" : "+"}
            </span>
          </button>
          {expandedLayer === "layer1" && config && (
            <div className="px-4 pb-4 space-y-2 border-t border-border pt-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.layer1.exclude_st}
                  onChange={() =>
                    updateConfig({
                      layer1: {
                        ...config.layer1,
                        exclude_st: !config.layer1.exclude_st,
                      },
                    })
                  }
                  className="rounded"
                />
                排除 ST 股票
                <Tip text="ST股票是被交易所特别处理的公司，通常存在财务风险或经营异常，波动大且有退市风险" />
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.layer1.exclude_suspended}
                  onChange={() =>
                    updateConfig({
                      layer1: {
                        ...config.layer1,
                        exclude_suspended: !config.layer1.exclude_suspended,
                      },
                    })
                  }
                  className="rounded"
                />
                排除停牌股票
                <Tip text="停牌股票无法交易，选入也无法买入，排除后避免无效信号" />
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.layer1.exclude_bse}
                  onChange={() =>
                    updateConfig({
                      layer1: {
                        ...config.layer1,
                        exclude_bse: !config.layer1.exclude_bse,
                      },
                    })
                  }
                  className="rounded"
                />
                排除北交所 (8xx)
                <Tip text="北交所股票流动性较低、涨跌幅30%，适合有经验的投资者，普通策略建议排除" />
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.layer1.exclude_star}
                  onChange={() =>
                    updateConfig({
                      layer1: {
                        ...config.layer1,
                        exclude_star: !config.layer1.exclude_star,
                      },
                    })
                  }
                  className="rounded"
                />
                排除科创板 (688xxx)
                <Tip text="科创板涨跌幅20%、开通需50万门槛，且多为高估值成长股，风险较高" />
              </label>
              <SectorSelector
                mode={config.layer1.sector_filter?.mode ?? "disabled"}
                selectedIds={config.layer1.sector_filter?.sector_ids ?? []}
                onModeChange={(mode) =>
                  updateConfig({
                    layer1: {
                      ...config.layer1,
                      sector_filter: {
                        mode,
                        sector_ids:
                          config.layer1.sector_filter?.sector_ids ?? [],
                      },
                    },
                  })
                }
                onSelectionChange={(ids) =>
                  updateConfig({
                    layer1: {
                      ...config.layer1,
                      sector_filter: {
                        mode: config.layer1.sector_filter?.mode ?? "include",
                        sector_ids: ids,
                      },
                    },
                  })
                }
              />
            </div>
          )}
        </div>

        {/* Layer 2 */}
        <div className="rounded-lg border border-border">
          <button
            type="button"
            onClick={() => toggleLayer("layer2")}
            className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center">
                2
              </span>
              <span className="font-semibold text-sm">趋势确认</span>
              <span className="text-xs text-muted-foreground">
                均线排列、ADX、方向指标
              </span>
            </div>
            <span className="text-muted-foreground">
              {expandedLayer === "layer2" ? "−" : "+"}
            </span>
          </button>
          {expandedLayer === "layer2" && config && (
            <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.layer2.require_ma_aligned}
                  onChange={() =>
                    updateConfig({
                      layer2: {
                        ...config.layer2,
                        require_ma_aligned: !config.layer2.require_ma_aligned,
                      },
                    })
                  }
                  className="rounded"
                />
                均线多头排列 (MA5 &gt; MA10 &gt; MA20 &gt; MA60)
                <Tip text="短期均线在上、长期均线在下，说明各周期投资者都在获利，是典型的上涨趋势形态" />
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.layer2.require_ma_converge}
                  onChange={() =>
                    updateConfig({
                      layer2: {
                        ...config.layer2,
                        require_ma_converge: !config.layer2.require_ma_converge,
                      },
                    })
                  }
                  className="rounded"
                />
                均线粘合 (MA价差收窄)
                <Tip text="多条均线距离很近时，说明多空力量胶着，即将选择方向突破，是布局时机" />
              </label>
              {config.layer2.require_ma_converge && (
                <div className="flex items-center gap-2 text-sm ml-6">
                  <span>粘合阈值:</span>
                  <NumInput
                    value={config.layer2.ma_converge_pct}
                    onChange={(v) =>
                      updateConfig({
                        layer2: { ...config.layer2, ma_converge_pct: v },
                      })
                    }
                    step={0.5}
                    min={0.5}
                    max={10}
                  />
                  <span className="text-muted-foreground">%</span>
                  <Tip text="各均线最大价差占比，越小说明越粘合。3%以内通常视为粘合状态" />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.layer2.require_trend_strong}
                  onChange={() =>
                    updateConfig({
                      layer2: {
                        ...config.layer2,
                        require_trend_strong:
                          !config.layer2.require_trend_strong,
                      },
                    })
                  }
                  className="rounded"
                />
                要求强趋势 (ADX &gt; 25)
                <Tip text="ADX衡量趋势强度（不分方向）。>25表示趋势明确，<20表示震荡无方向" />
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.layer2.require_di_bullish}
                  onChange={() =>
                    updateConfig({
                      layer2: {
                        ...config.layer2,
                        require_di_bullish: !config.layer2.require_di_bullish,
                      },
                    })
                  }
                  className="rounded"
                />
                方向看多 (+DI &gt; -DI)
                <Tip text="+DI代表上涨力量，-DI代表下跌力量。+DI > -DI表示多头占优，市场偏向上涨" />
              </label>
              <div className="flex items-center gap-2 text-sm">
                <span>最低 ADX:</span>
                <NumInput
                  value={config.layer2.min_adx}
                  onChange={(v) =>
                    updateConfig({ layer2: { ...config.layer2, min_adx: v } })
                  }
                  step={5}
                  min={0}
                  max={100}
                />
                <Tip text="设为0表示不限制。设为20以上可过滤掉震荡无趋势的股票" />
              </div>
            </div>
          )}
        </div>

        {/* Layer 3 */}
        <div className="rounded-lg border border-border">
          <button
            type="button"
            onClick={() => toggleLayer("layer3")}
            className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center">
                3
              </span>
              <span className="font-semibold text-sm">量价择时</span>
              <span className="text-xs text-muted-foreground">
                成交额、量比、MACD、KDJ、RSI
              </span>
            </div>
            <span className="text-muted-foreground">
              {expandedLayer === "layer3" ? "−" : "+"}
            </span>
          </button>
          {expandedLayer === "layer3" && config && (
            <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
              <div className="flex items-center gap-2 text-sm">
                <span>最低成交额:</span>
                <NumInput
                  value={config.layer3.min_amount / 1e8}
                  onChange={(v) =>
                    updateConfig({
                      layer3: { ...config.layer3, min_amount: v * 1e8 },
                    })
                  }
                  step={0.5}
                  min={0}
                />
                <span className="text-muted-foreground">亿</span>
                <Tip text="成交额反映资金活跃度。低于2亿的股票流动性差，大资金难以进出，容易被操纵" />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span>量比范围:</span>
                <NumInput
                  value={config.layer3.min_volume_ratio}
                  onChange={(v) =>
                    updateConfig({
                      layer3: { ...config.layer3, min_volume_ratio: v },
                    })
                  }
                  step={0.1}
                  min={0}
                />
                <span className="text-muted-foreground">~</span>
                <NumInput
                  value={config.layer3.max_volume_ratio}
                  onChange={(v) =>
                    updateConfig({
                      layer3: { ...config.layer3, max_volume_ratio: v },
                    })
                  }
                  step={0.1}
                  min={0}
                />
                <Tip text="量比=当日成交量/近5日平均成交量。>1.5为放量（资金涌入），<0.8为缩量（观望）" />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.layer3.require_macd_golden_cross}
                  onChange={() =>
                    updateConfig({
                      layer3: {
                        ...config.layer3,
                        require_macd_golden_cross:
                          !config.layer3.require_macd_golden_cross,
                      },
                    })
                  }
                  className="rounded"
                />
                MACD 金叉
                <Tip text="DIF线从下方穿越DEA线，是经典的买入信号。代表短期动能开始强于长期动能" />
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.layer3.require_macd_positive}
                  onChange={() =>
                    updateConfig({
                      layer3: {
                        ...config.layer3,
                        require_macd_positive:
                          !config.layer3.require_macd_positive,
                      },
                    })
                  }
                  className="rounded"
                />
                MACD 柱为正
                <Tip text="MACD柱状图为正表示多头动能大于空头，即使没有金叉也说明上涨趋势在延续" />
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.layer3.require_kdj_golden_cross}
                  onChange={() =>
                    updateConfig({
                      layer3: {
                        ...config.layer3,
                        require_kdj_golden_cross:
                          !config.layer3.require_kdj_golden_cross,
                      },
                    })
                  }
                  className="rounded"
                />
                KDJ 金叉
                <Tip text="K线从下穿越D线，是短线买入信号。KDJ对价格变化敏感，适合捕捉短期拐点" />
              </label>
              <div className="flex items-center gap-2 text-sm">
                <span>RSI 范围:</span>
                <NumInput
                  value={config.layer3.rsi_min}
                  onChange={(v) =>
                    updateConfig({ layer3: { ...config.layer3, rsi_min: v } })
                  }
                  step={5}
                  min={0}
                  max={100}
                />
                <span className="text-muted-foreground">~</span>
                <NumInput
                  value={config.layer3.rsi_max}
                  onChange={(v) =>
                    updateConfig({ layer3: { ...config.layer3, rsi_max: v } })
                  }
                  step={5}
                  min={0}
                  max={100}
                />
                <Tip text="RSI衡量超买超卖。<30为超卖（可能反弹），>70为超买（可能回调）。40-60为中性区间" />
              </div>
            </div>
          )}
        </div>

        {/* Layer 4 */}
        <div className="rounded-lg border border-border">
          <button
            type="button"
            onClick={() => toggleLayer("layer4")}
            className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center justify-center">
                4
              </span>
              <span className="font-semibold text-sm">风控过滤</span>
              <span className="text-xs text-muted-foreground">
                回撤、乖离率、WR、布林带位置
              </span>
            </div>
            <span className="text-muted-foreground">
              {expandedLayer === "layer4" ? "−" : "+"}
            </span>
          </button>
          {expandedLayer === "layer4" && config && (
            <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
              <div className="flex items-center gap-2 text-sm">
                <span>最大回撤限制:</span>
                <NumInput
                  value={config.layer4.max_drawdown_limit}
                  onChange={(v) =>
                    updateConfig({
                      layer4: { ...config.layer4, max_drawdown_limit: v },
                    })
                  }
                  step={1}
                  min={1}
                  max={50}
                />
                <span className="text-muted-foreground">%</span>
                <Tip text="近20天内从最高点到最低点的跌幅。回撤过大说明股票正在急跌中，追高风险大" />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span>最大连跌天数:</span>
                <NumInput
                  value={Math.abs(config.layer4.max_consecutive_down)}
                  onChange={(v) =>
                    updateConfig({
                      layer4: {
                        ...config.layer4,
                        max_consecutive_down: -Math.abs(v),
                      },
                    })
                  }
                  step={1}
                  min={1}
                  max={10}
                />
                <span className="text-muted-foreground">天</span>
                <Tip text="连续下跌天数。超过阈值说明空头力量持续，不宜逆势买入" />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span>乖离率范围:</span>
                <NumInput
                  value={config.layer4.min_bias}
                  onChange={(v) =>
                    updateConfig({ layer4: { ...config.layer4, min_bias: v } })
                  }
                  step={1}
                  min={-30}
                  max={0}
                />
                <span className="text-muted-foreground">~</span>
                <NumInput
                  value={config.layer4.max_bias}
                  onChange={(v) =>
                    updateConfig({ layer4: { ...config.layer4, max_bias: v } })
                  }
                  step={1}
                  min={0}
                  max={30}
                />
                <span className="text-muted-foreground">%</span>
                <Tip text="股价偏离20日均线的程度。正值过大=超涨易回调，负值过大=超跌可能反弹" />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span>WR 超买阈值:</span>
                <NumInput
                  value={config.layer4.wr_overbought}
                  onChange={(v) =>
                    updateConfig({
                      layer4: { ...config.layer4, wr_overbought: v },
                    })
                  }
                  step={5}
                  min={0}
                  max={100}
                />
                <Tip text="威廉指标(WR)，数值越低表示越超买。WR<20通常认为超买，可能面临回调" />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span>布林带上限:</span>
                <NumInput
                  value={config.layer4.boll_upper_limit}
                  onChange={(v) =>
                    updateConfig({
                      layer4: { ...config.layer4, boll_upper_limit: v },
                    })
                  }
                  step={0.05}
                  min={0}
                  max={1}
                  className="w-24"
                />
                <Tip text="股价在布林带中的位置（0=下轨，1=上轨）。接近上轨时追高风险大，建议设为0.95以下" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="rounded-lg border border-border">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold">
            筛选结果 ({results?.screen_date ?? "-"}) - 共 {results?.total ?? 0}{" "}
            只
          </h3>
          {results && results.total > 0 && config && (
            <button
              type="button"
              onClick={() => setShowShareDialog(true)}
              className="px-3 py-1.5 text-xs border border-border rounded-md hover:bg-muted/50 transition-colors"
            >
              分享结果
            </button>
          )}
        </div>
        <StockTable
          columns={screeningColumns}
          data={results?.items ?? []}
          rowKey={(row) => row.stock_code}
          emptyText={'暂无选股结果，请点击"运行选股"'}
        />
        {results && results.total > 30 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm">
            <span>
              第 {page} 页 / 共 {Math.ceil(results.total / 30)} 页
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border rounded disabled:opacity-30"
              >
                上一页
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page * 30 >= results.total}
                className="px-3 py-1 border rounded disabled:opacity-30"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Share Dialog */}
      {config && (
        <ShareDialog
          open={showShareDialog}
          onClose={() => setShowShareDialog(false)}
          config={config}
          results={results}
          presets={presets}
          customStrategies={customStrategies}
        />
      )}
    </div>
  );
}
