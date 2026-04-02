import { NavLink, Outlet } from "react-router-dom";
import { ShieldAlert, Bell, Users, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const baseNav = [
  { label: "Domains", to: "/app", icon: ShieldAlert },
  { label: "Notifications", to: "/app/notifications", icon: Bell },
];

export function AppShell() {
  const { user, logout } = useAuth();

  const navItems = user?.role === "super_admin"
    ? [...baseNav, { label: "Admin", to: "/app/admin", icon: Users }]
    : baseNav;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="page-shell flex items-center justify-between py-4">
          <div>
            <p className="text-sm text-muted-foreground">go-check-ssl</p>
            <h1 className="text-xl font-semibold">SSL certificate monitoring</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-sm">
              <p className="font-medium">{user?.email}</p>
              <p className="text-muted-foreground">{user?.role}</p>
            </div>
            <Button variant="outline" onClick={() => void logout()}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
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
