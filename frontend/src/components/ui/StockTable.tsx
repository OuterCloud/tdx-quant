import { useRef, useState } from "react";

export function Tip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  const handleEnter = () => {
    setShow(true);
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const tipWidth = 208;
      let left = rect.left + rect.width / 2 - tipWidth / 2;
      if (left < 8) left = 8;
      if (left + tipWidth > window.innerWidth - 8) left = window.innerWidth - 8 - tipWidth;
      setStyle({ top: rect.top - 6, left, transform: "translateY(-100%)" });
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

export interface ColumnDef<T> {
  key: string;
  title: string | React.ReactNode;
  tip?: string;
  align?: "left" | "right" | "center";
  render: (row: T) => React.ReactNode;
}

interface StockTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  rowKey: (row: T) => string;
  emptyText?: string;
}

export function StockTable<T>({ columns, data, rowKey, emptyText = "暂无数据" }: StockTableProps<T>) {
  const isLast = (idx: number) => idx === columns.length - 1;

  const getHeaderStickyClass = (idx: number) => {
    if (idx === 0) return "sticky left-0 bg-muted/50 z-10";
    if (idx === 1) return "sticky left-[72px] bg-muted/50 z-10 border-r border-border";
    if (isLast(idx)) return "sticky right-0 bg-muted/50 z-10 border-l border-border";
    return "";
  };

  const getCellStickyClass = (idx: number) => {
    if (idx === 0) return "sticky left-0 bg-background z-10";
    if (idx === 1) return "sticky left-[72px] bg-background z-10 border-r border-border";
    if (isLast(idx)) return "sticky right-0 bg-background z-10 border-l border-border";
    return "";
  };

  const alignClass = (align?: "left" | "right" | "center") => {
    if (align === "right") return "text-right";
    if (align === "center") return "text-center";
    return "text-left";
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm table-fixed">
        <colgroup>
          {columns.map((col, idx) => (
            <col
              key={col.key}
              style={{ minWidth: idx === 0 ? 72 : idx === 1 ? 80 : 76 }}
            />
          ))}
        </colgroup>
        <thead className="bg-muted/50">
          <tr>
            {columns.map((col, idx) => (
              <th
                key={col.key}
                className={`px-3 py-2.5 whitespace-nowrap ${alignClass(col.align)} ${getHeaderStickyClass(idx)}`}
              >
                {col.title}
                {col.tip && <Tip text={col.tip} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length > 0 ? (
            data.map((row) => (
              <tr key={rowKey(row)} className="border-t border-border hover:bg-muted/30">
                {columns.map((col, idx) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2.5 whitespace-nowrap ${alignClass(col.align)} ${getCellStickyClass(idx)}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="p-8 text-center text-muted-foreground">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
