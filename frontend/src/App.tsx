import { BrowserRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Stocks from "@/pages/Stocks";
import Sectors from "@/pages/Sectors";
import Screening from "@/pages/Screening";
import Backtest from "@/pages/Backtest";
import Settings from "@/pages/Settings";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="stocks" element={<Stocks />} />
            <Route path="sectors" element={<Sectors />} />
            <Route path="screening" element={<Screening />} />
            <Route path="backtest" element={<Backtest />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
