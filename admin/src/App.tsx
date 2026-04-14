import { useState, useCallback, useEffect, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./hooks/use-auth";
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

const queryClient = new QueryClient();

function QueryErrorHandler({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handle = (err: unknown) => {
      if (err instanceof Error && err.message === "Unauthorized") {
        logout();
        navigate("/login", { replace: true });
      }
    };

    const unsubQ = queryClient.getQueryCache().subscribe((e) => {
      if (e?.query?.state?.status === "error") handle(e.query.state.error);
    });

    const unsubM = queryClient.getMutationCache().subscribe((e) => {
      if (e?.mutation?.state?.status === "error") handle(e.mutation.state.error);
    });

    return () => {
      unsubQ();
      unsubM();
    };
  }, [logout, navigate]);

  return <>{children}</>;
}

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
        <main className="p-4 pt-20">
          <AuthGuard />
        </main>
      </div>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter basename="/admin">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <QueryErrorHandler>
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
          </QueryErrorHandler>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}
