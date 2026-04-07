import { NavLink, Outlet } from "react-router-dom";
import { ShieldAlert, Bell, Users, LogOut, Settings } from "lucide-react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function AppShell() {
  const { user, logout } = useAuth();
  const { t } = useI18n();

  const baseNav = [
    { label: t("nav.domains"), to: "/app", icon: ShieldAlert },
    { label: t("nav.notifications"), to: "/app/notifications", icon: Bell },
    { label: t("nav.settings"), to: "/app/settings", icon: Settings },
  ];

  const navItems = user?.role === "super_admin"
    ? [...baseNav, { label: t("nav.admin"), to: "/app/admin", icon: Users }]
    : baseNav;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="page-shell flex items-center justify-between py-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">Certwarden</p>
            <h1 className="text-xl font-semibold">{t("shell.title")}</h1>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <div className="text-right text-sm">
              <p className="font-medium">{user?.username}</p>
              <p className="text-muted-foreground">{user?.email || t("settings.noEmailBound")}</p>
              <p className="text-muted-foreground">
                {user?.role ? t(user.role === "super_admin" ? "role.super_admin" : "role.tenant_owner") : null}
              </p>
            </div>
            <Button variant="outline" onClick={() => void logout()}>
              <LogOut className="mr-2 h-4 w-4" />
              {t("common.logout")}
            </Button>
          </div>
        </div>
      </header>

      <div className="page-shell grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="space-y-1 rounded-xl border border-border bg-card p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/app"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground",
                    isActive && "bg-accent text-foreground"
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </aside>

        <main className="space-y-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
