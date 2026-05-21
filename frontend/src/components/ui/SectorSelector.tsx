import { useMemo, useRef, useState } from "react";
import { useSectors, type SectorItem } from "../../hooks/useSectors";

interface SectorSelectorProps {
  mode: "include" | "exclude" | "disabled";
  selectedIds: number[];
  onModeChange: (mode: "include" | "exclude" | "disabled") => void;
  onSelectionChange: (ids: number[]) => void;
}

const HOT_SECTORS = ["人工智能", "新能源", "半导体", "消费电子", "光通信模块", "算力概念", "机器人"];

export function SectorSelector({ mode, selectedIds, onModeChange, onSelectionChange }: SectorSelectorProps) {
  const { data: sectors } = useSectors();
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!sectors || !search.trim()) return [];
    const q = search.trim().toLowerCase();
    return sectors
      .filter((s) => s.name.toLowerCase().includes(q) && !selectedIds.includes(s.id))
      .slice(0, 20);
  }, [sectors, search, selectedIds]);

  const selectedSectors = useMemo(() => {
    if (!sectors) return [];
    return selectedIds.map((id) => sectors.find((s) => s.id === id)).filter(Boolean) as SectorItem[];
  }, [sectors, selectedIds]);

  const hotSectorItems = useMemo(() => {
    if (!sectors) return [];
    return HOT_SECTORS.map((name) => sectors.find((s) => s.name === name)).filter(Boolean) as SectorItem[];
  }, [sectors]);

  const addSector = (sector: SectorItem) => {
    if (!selectedIds.includes(sector.id)) {
      onSelectionChange([...selectedIds, sector.id]);
    }
    setSearch("");
    setShowDropdown(false);
  };

  const removeSector = (id: number) => {
    onSelectionChange(selectedIds.filter((sid) => sid !== id));
  };

  const isEmpty = !sectors || sectors.length === 0;

  return (
    <div className="space-y-2 pt-2 border-t border-border/50 mt-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground whitespace-nowrap">板块过滤:</span>
        <select
          value={mode}
          onChange={(e) => onModeChange(e.target.value as "include" | "exclude" | "disabled")}
          className="px-2 py-1 border border-border rounded text-sm bg-background"
        >
          <option value="disabled">不限</option>
          <option value="include">仅包含</option>
          <option value="exclude">排除</option>
        </select>
      </div>

      {mode !== "disabled" && (
        <>
          {isEmpty ? (
            <p className="text-xs text-muted-foreground bg-muted/30 px-2 py-1.5 rounded">
              暂无板块数据，请先在设置页同步板块数据
            </p>
          ) : (
            <>
              {/* Search input */}
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  placeholder="搜索板块名称..."
                  className="w-full px-3 py-1.5 border border-border rounded text-sm bg-background placeholder:text-muted-foreground/60"
                />
                {showDropdown && filtered.length > 0 && (
                  <div
                    ref={dropdownRef}
                    className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto border border-border rounded-md bg-background shadow-lg"
                  >
                    {filtered.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addSector(s)}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50 flex justify-between items-center"
                      >
                        <span>{s.name}</span>
                        <span className="text-xs text-muted-foreground">{s.stock_count}只</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected tags */}
              {selectedSectors.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedSectors.map((s) => (
                    <span
                      key={s.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs"
                    >
                      {s.name}
                      <button
                        type="button"
                        onClick={() => removeSector(s.id)}
                        className="w-3.5 h-3.5 rounded-full hover:bg-primary/20 flex items-center justify-center text-[10px]"
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Hot sectors */}
              {hotSectorItems.length > 0 && selectedIds.length === 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">热门:</span>
                  {hotSectorItems
                    .filter((s) => !selectedIds.includes(s.id))
                    .map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => addSector(s)}
                        className="px-1.5 py-0.5 rounded border border-border hover:border-primary/50 hover:text-primary transition-colors"
                      >
                        {s.name}
                      </button>
                    ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
