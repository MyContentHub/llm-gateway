import { useState, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./hooks/use-auth";
import { AuthGuard } from "./components/layout/auth-guard";
import { Sidebar } from "./components/layout/sidebar";
import { Navbar } from "./components/layout/navbar";
import { LoginPage } from "./pages/login";
import { OverviewPage } from "./pages/overview";
import { KeysPage } from "./pages/keys";
import { AuditPage } from "./pages/audit";
import { SecurityPage } from "./pages/security";
import { ProvidersPage } from "./pages/providers";
import { SettingsPage } from "./pages/settings";

function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = useCallback(() => setCollapsed((c) => !c), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const openMobile = useCallback(() => setMobileOpen(true), []);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={closeMobile}
      />
      <div
        className={`transition-all duration-300 ${
          collapsed ? "lg:pl-16" : "lg:pl-60"
        }`}
      >
        <Navbar onMobileMenuToggle={openMobile} />
        <main className="pt-16 p-4 lg:p-6">
          <AuthGuard />
        </main>
      </div>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<DashboardLayout />}>
            <Route index element={<OverviewPage />} />
            <Route path="keys" element={<KeysPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="security" element={<SecurityPage />} />
            <Route path="providers" element={<ProvidersPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
