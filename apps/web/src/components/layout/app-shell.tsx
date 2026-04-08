import { NavLink, Outlet } from "react-router-dom";
import { ArrowLeftRight, Bell, LogOut, Settings, ShieldAlert, Users } from "lucide-react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function AppShell({ mode = "workspace" }: { mode?: "workspace" | "admin" }) {
  const { user, logout } = useAuth();
  const { t } = useI18n();

  const navItems = mode === "admin"
    ? [
        { label: t("nav.admin"), to: "/admin", icon: Users, end: true },
        { label: t("nav.backToWorkspace"), to: "/app", icon: ArrowLeftRight, end: false },
      ]
    : [
        { label: t("nav.domains"), to: "/app", icon: ShieldAlert, end: true },
        { label: t("nav.notifications"), to: "/app/notifications", icon: Bell, end: false },
        { label: t("nav.settings"), to: "/app/settings", icon: Settings, end: false },
      ];

  const shellTitle = mode === "admin" ? t("shell.adminTitle") : t("shell.title");
  const roleLabel = user?.role ? t(user.role === "super_admin" ? "role.super_admin" : "role.tenant_owner") : "";
  const secondaryIdentity = [roleLabel, user?.email || t("settings.noEmailBound")].filter(Boolean).join(" · ");

  return (
    <div className="min-h-screen bg-background">
      <header className="warm-topbar sticky top-0 z-40">
        <div className="page-shell flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="brand-kicker">Certwarden</p>
            <h1 className="editorial-title text-[30px] text-foreground">{shellTitle}</h1>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <LanguageSwitcher />
            {mode === "workspace" && user?.role === "super_admin" ? (
              <NavLink
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-[12px] border border-border bg-[#fffdf8] px-4 text-[14px] font-medium text-foreground shadow-[0_0_0_1px_rgba(240,238,230,0.8)] transition hover:bg-[#f3f0e6]"
                to="/admin"
              >
                {t("nav.admin")}
              </NavLink>
            ) : null}
            <div className="flex h-10 min-w-[220px] max-w-[320px] items-center rounded-[14px] border border-border bg-[#fffdf8] px-4 text-right shadow-[0_0_0_1px_rgba(240,238,230,0.8)]">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-foreground">{user?.username}</p>
                <p className="truncate text-[11px] uppercase tracking-[0.08em] text-muted-foreground" title={secondaryIdentity}>
                  {secondaryIdentity}
                </p>
              </div>
            </div>
            <Button variant="command" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" />
              {t("common.logout")}
            </Button>
          </div>
        </div>
      </header>

      <div className="page-shell grid gap-8 py-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:py-10">
        <aside className="h-fit rounded-[28px] border border-border bg-card p-3 shadow-[0_0_0_1px_rgba(240,238,230,0.85),0_8px_28px_rgba(20,20,19,0.05)] lg:sticky lg:top-[104px]">
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-[14px] px-4 py-3 text-[15px] font-medium transition",
                      isActive
                        ? "bg-accent text-accent-foreground shadow-[0_0_0_1px_rgba(48,48,46,0.95),0_10px_24px_rgba(20,20,19,0.08)]"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </aside>

        <main className="space-y-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
