import type { ReactNode } from "react";
import { Navigate, Outlet, Route, BrowserRouter as Router, Routes } from "react-router-dom";

import { AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/lib/auth";
import { AdminPage } from "@/pages/admin-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { ForgotPasswordPage } from "@/pages/forgot-password-page";
import { LoginPage } from "@/pages/login-page";
import { NotificationsPage } from "@/pages/notifications-page";
import { RegisterPage } from "@/pages/register-page";
import { ResetPasswordPage } from "@/pages/reset-password-page";
import { VerifyEmailPage } from "@/pages/verify-email-page";

function ProtectedLayout() {
  const { loading, user } = useAuth();

  if (loading) {
    return <div className="page-shell py-20">Loading session…</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <AppShell />;
}

function AdminRoute() {
  const { user } = useAuth();
  if (user?.role !== "super_admin") {
    return <Navigate to="/app" replace />;
  }
  return <Outlet />;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="page-shell py-20">Loading session…</div>;
  }
  if (user) {
    return <Navigate to="/app" replace />;
  }
  return <>{children}</>;
}

export function AppRouter() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route
          path="/login"
          element={
            <PublicOnly>
              <LoginPage />
            </PublicOnly>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnly>
              <RegisterPage />
            </PublicOnly>
          }
        />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route
          path="/forgot-password"
          element={
            <PublicOnly>
              <ForgotPasswordPage />
            </PublicOnly>
          }
        />
        <Route
          path="/reset-password"
          element={
            <PublicOnly>
              <ResetPasswordPage />
            </PublicOnly>
          }
        />

        <Route path="/app" element={<ProtectedLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route element={<AdminRoute />}>
            <Route path="admin" element={<AdminPage />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}
