import { cn } from "@/lib/utils";
import { NavLink, Outlet } from "react-router";

const navItems = [
  { path: "/", label: "市场总览", icon: "📊" },
  { path: "/stocks", label: "股票数据", icon: "📈" },
  { path: "/screening", label: "选股策略", icon: "🔍" },
  { path: "/backtest", label: "回测分析", icon: "📉" },
  { path: "/settings", label: "系统设置", icon: "⚙️" },
];

export function AppLayout() {
  return (
    <div className="flex h-screen">
      <aside className="w-60 border-r border-border bg-muted/50 flex flex-col">
        <div className="p-4 border-b border-border">
          <h1 className="text-lg font-bold">
            TDX{" "}
            <span className="text-sm font-normal text-muted-foreground">
              - 他都行
            </span>
          </h1>
          <p className="text-xs text-muted-foreground">量化选股系统</p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent",
                )
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border text-[10px] text-muted-foreground text-center">
          &copy; 2026 TDX量化. All rights reserved.
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
