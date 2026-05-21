import {
  type BuyListItem,
  useBuyList,
  useDataStatus,
  useMarketOverview,
  useTodaySummary,
} from "@/hooks/useDashboard";
import { StockTable, type ColumnDef } from "@/components/ui/StockTable";

function StatCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function formatAmount(amount: number | null): string {
  if (amount == null) return "-";
  return `${(amount / 1e8).toFixed(2)}亿`;
}

const buyListColumns: ColumnDef<BuyListItem>[] = [
  { key: "code", title: "代码", render: (r) => <span className="font-mono">{r.stock_code}</span> },
  { key: "name", title: "名称", render: (r) => r.stock_name },
  { key: "close", title: "收盘价", align: "right", tip: "最新交易日的收盘价格", render: (r) => r.close?.toFixed(2) ?? "-" },
  { key: "amount", title: "成交额", align: "right", tip: "当日总成交金额（亿元），>2亿为活跃", render: (r) => formatAmount(r.amount) },
  { key: "ma5", title: "MA5", align: "right", tip: "5日均线价格，反映近一周平均成本", render: (r) => r.ma5?.toFixed(2) ?? "-" },
  { key: "ma10", title: "MA10", align: "right", tip: "10日均线价格，反映近两周平均成本", render: (r) => r.ma10?.toFixed(2) ?? "-" },
  { key: "ma20", title: "MA20", align: "right", tip: "20日均线价格，反映近一月平均成本", render: (r) => r.ma20?.toFixed(2) ?? "-" },
  { key: "ma60", title: "MA60", align: "right", tip: "60日均线价格，反映中期趋势方向", render: (r) => r.ma60?.toFixed(2) ?? "-" },
  { key: "macd", title: "MACD柱", align: "right", tip: "MACD柱状图值，正值为多头动能", render: (r) => r.macd_hist?.toFixed(4) ?? "-" },
  { key: "cross", title: "金叉", align: "center", tip: "MACD金叉信号，Y表示近期出现金叉买入信号", render: (r) => r.macd_golden_cross ? <span className="text-green-500 font-medium">Y</span> : <span className="text-muted-foreground">-</span> },
  { key: "score", title: "得分", align: "right", tip: "综合评分（满分约20分）。>15分：非常强势；10-15分：较好；5-10分：一般；<5分：较弱", render: (r) => <span className="font-semibold">{r.score.toFixed(1)}</span> },
];

export default function Dashboard() {
  const { data: overview } = useMarketOverview();
  const { data: summary } = useTodaySummary();
  const { data: buyList } = useBuyList();
  const { data: status } = useDataStatus();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">市场总览</h2>

      {/* Market Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="总股票数"
          value={overview?.total_stocks ?? "-"}
          sub={`交易中: ${overview?.trading_stocks ?? "-"}`}
        />
        <StatCard
          title="今日选股"
          value={summary?.layer2_passed ?? "-"}
          sub={`Layer1通过: ${summary?.layer1_passed ?? "-"}`}
        />
        <StatCard
          title="数据文件"
          value={status?.total_files ?? "-"}
          sub={status?.is_busy ? "数据更新中..." : "空闲"}
        />
        <StatCard
          title="最后更新"
          value={
            overview?.data_updated_at
              ? new Date(overview.data_updated_at).toLocaleDateString()
              : "未更新"
          }
        />
      </div>

      {/* Buy List Table */}
      <div className="rounded-lg border border-border">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold">
            买入清单 ({summary?.screen_date ?? "-"})
          </h3>
        </div>
        <StockTable
          columns={buyListColumns}
          data={buyList ?? []}
          rowKey={(row) => row.stock_code}
          emptyText={status?.has_data ? "今日无选股结果" : "暂无数据，请先在设置页初始化数据"}
        />
      </div>
    </div>
  );
}
