import { useCallback, useEffect, useState } from "react";
import {
  useSectors,
  useSectorMembers,
  type SectorItem,
} from "@/hooks/useSectors";
import { Tip } from "@/components/ui/StockTable";

type SortField = "pct_change" | "amount" | "volume_ratio";
type SortOrder = "asc" | "desc";

function SortHeader({
  label,
  field,
  activeField,
  activeOrder,
  onSort,
  children,
}: {
  label: string;
  field: SortField;
  activeField: SortField;
  activeOrder: SortOrder;
  onSort: (field: SortField) => void;
  children?: React.ReactNode;
}) {
  const isActive = activeField === field;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors"
    >
      {label}
      <span className={`text-[10px] ${isActive ? "text-foreground" : "text-muted-foreground/50"}`}>
        {isActive ? (activeOrder === "desc" ? "↓" : "↑") : "↕"}
      </span>
      {children}
    </button>
  );
}

export default function Sectors() {
  const [search, setSearch] = useState("");
  const [selectedSector, setSelectedSector] = useState<SectorItem | null>(null);
  const [sectorPage, setSectorPage] = useState(1);
  const [memberPage, setMemberPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortField>("amount");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [maAlignedOnly, setMaAlignedOnly] = useState(false);

  const { data: allSectors } = useSectors();
  const { data: membersData, isLoading: membersLoading } = useSectorMembers({
    sectorId: selectedSector?.id ?? null,
    page: memberPage,
    sortBy,
    sortOrder,
    maAlignedOnly,
  });

  // Filter sectors by search
  const filtered = allSectors?.filter((s) =>
    s.name.includes(search),
  ) ?? [];

  const sectorPageSize = 30;
  const totalSectorPages = Math.ceil(filtered.length / sectorPageSize);
  const pagedSectors = filtered.slice(
    (sectorPage - 1) * sectorPageSize,
    sectorPage * sectorPageSize,
  );

  // Auto-select first sector on initial load
  useEffect(() => {
    if (!selectedSector && pagedSectors.length > 0) {
      setSelectedSector(pagedSectors[0]);
    }
  }, [pagedSectors, selectedSector]);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setSectorPage(1);
  }, []);

  const handleSelectSector = (sector: SectorItem) => {
    setSelectedSector(sector);
    setMemberPage(1);
  };

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setMemberPage(1);
  };

  const handleToggleMaFilter = () => {
    setMaAlignedOnly((v) => !v);
    setMemberPage(1);
  };

  const memberPageSize = 30;
  const totalMembers = membersData?.total ?? 0;
  const totalMemberPages = Math.ceil(totalMembers / memberPageSize);

  return (
    <div
      className="flex flex-col gap-4"
      style={{ height: "calc(100vh - 48px)" }}
    >
      <h2 className="text-2xl font-bold shrink-0">板块数据</h2>

      <div className="flex gap-4 min-h-0 flex-1">
        {/* Left: Sector List */}
        <div className="w-72 shrink-0 flex flex-col gap-3">
          <input
            type="text"
            placeholder="搜索板块..."
            value={search}
            onChange={handleSearch}
            className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
          />

          <div className="border border-border rounded-md overflow-hidden flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto">
              {pagedSectors.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => handleSelectSector(s)}
                  className={`w-full text-left px-3 py-1.5 text-sm border-b border-border hover:bg-muted/50 transition-colors flex justify-between items-center ${
                    selectedSector?.id === s.id ? "bg-primary/10" : ""
                  }`}
                >
                  <span className="truncate">{s.name}</span>
                  <span className="text-xs text-muted-foreground ml-2 shrink-0">
                    {s.stock_count}只
                  </span>
                </button>
              ))}
            </div>
            {totalSectorPages > 1 && (
              <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 text-xs border-t border-border">
                <span>
                  {(sectorPage - 1) * sectorPageSize + 1}-
                  {Math.min(sectorPage * sectorPageSize, filtered.length)} /{" "}
                  {filtered.length}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setSectorPage((p) => Math.max(1, p - 1))}
                    disabled={sectorPage === 1}
                    className="px-2 py-0.5 border rounded disabled:opacity-30"
                  >
                    &lt;
                  </button>
                  <button
                    type="button"
                    onClick={() => setSectorPage((p) => Math.min(totalSectorPages, p + 1))}
                    disabled={sectorPage >= totalSectorPages}
                    className="px-2 py-0.5 border rounded disabled:opacity-30"
                  >
                    &gt;
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Member Stocks Table */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {selectedSector ? (
            membersLoading ? (
              <div className="flex items-center justify-center h-96 text-muted-foreground">
                加载中...
              </div>
            ) : membersData ? (
              <div className="space-y-3">
                <div className="flex items-baseline gap-3">
                  <span className="text-lg font-bold">
                    {membersData.sector.name}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    ({membersData.total}只)
                  </span>
                </div>

                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/20">
                        <tr>
                          <th className="text-left px-3 py-2">代码</th>
                          <th className="text-left px-3 py-2">名称</th>
                          <th className="text-right px-3 py-2">收盘价</th>
                          <th className="text-right px-3 py-2">
                            <SortHeader label="涨跌%" field="pct_change" activeField={sortBy} activeOrder={sortOrder} onSort={handleSort} />
                          </th>
                          <th className="text-right px-3 py-2">
                            <SortHeader label="成交额" field="amount" activeField={sortBy} activeOrder={sortOrder} onSort={handleSort} />
                          </th>
                          <th className="text-right px-3 py-2">
                            <SortHeader label="量比" field="volume_ratio" activeField={sortBy} activeOrder={sortOrder} onSort={handleSort}>
                              <Tip text="当日成交量与过去5日平均成交量的比值，>1表示放量" />
                            </SortHeader>
                          </th>
                          <th className="text-center px-3 py-2">
                            <button
                              type="button"
                              onClick={handleToggleMaFilter}
                              className={`inline-flex items-center gap-1 transition-colors ${maAlignedOnly ? "text-red-500" : "hover:text-foreground"}`}
                            >
                              均线多头
                              {maAlignedOnly && <span className="text-[10px]">✓</span>}
                            </button>
                            <Tip text="MA5 > MA10 > MA20 > MA60，短期均线在上方排列，表示多头趋势。点击表头可筛选" />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {membersData.items.map((item) => (
                          <tr
                            key={item.stock_code}
                            className="border-t border-border hover:bg-muted/20"
                          >
                            <td className="px-3 py-1.5 font-mono text-xs">
                              {item.stock_code}
                            </td>
                            <td className="px-3 py-1.5">{item.stock_name}</td>
                            <td className="px-3 py-1.5 text-right font-mono">
                              {item.close != null ? item.close.toFixed(2) : "-"}
                            </td>
                            <td
                              className={`px-3 py-1.5 text-right font-mono ${
                                item.pct_change != null
                                  ? item.pct_change >= 0
                                    ? "text-red-500"
                                    : "text-green-500"
                                  : ""
                              }`}
                            >
                              {item.pct_change != null
                                ? `${item.pct_change >= 0 ? "+" : ""}${item.pct_change.toFixed(2)}%`
                                : "-"}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono">
                              {item.amount != null
                                ? `${(item.amount / 1e8).toFixed(2)}亿`
                                : "-"}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono">
                              {item.volume_ratio != null
                                ? item.volume_ratio.toFixed(2)
                                : "-"}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              {item.ma_aligned ? (
                                <span className="text-red-500">●</span>
                              ) : (
                                <span className="text-muted-foreground">○</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {totalMemberPages > 1 && (
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      共 {totalMembers} 只 · 第 {memberPage}/{totalMemberPages} 页
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setMemberPage((p) => Math.max(1, p - 1))}
                        disabled={memberPage === 1}
                        className="px-3 py-1 border rounded text-sm disabled:opacity-30"
                      >
                        上一页
                      </button>
                      <button
                        type="button"
                        onClick={() => setMemberPage((p) => Math.min(totalMemberPages, p + 1))}
                        disabled={memberPage >= totalMemberPages}
                        className="px-3 py-1 border rounded text-sm disabled:opacity-30"
                      >
                        下一页
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null
          ) : (
            <div className="flex items-center justify-center h-96 text-muted-foreground">
              请从左侧选择一个板块查看成分股
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
