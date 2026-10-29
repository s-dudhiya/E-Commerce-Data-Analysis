import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { ProductDynamicsPage } from "@/routes/platform-comparison";
import { OverviewPage } from "@/routes/index";
import { ExplorerPage } from "@/routes/explorer";

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/platform-comparison" element={<ProductDynamicsPage />} />
        <Route path="/explorer" element={<ExplorerPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
