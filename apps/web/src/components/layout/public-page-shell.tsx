import type { ReactNode } from "react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useI18n } from "@/lib/i18n";

export function PublicPageShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-background">
      <header className="warm-topbar sticky top-0 z-40">
        <div className="page-shell flex items-center justify-between py-4">
          <div className="space-y-1">
            <p className="brand-kicker">Certwarden</p>
            <p className="text-[14px] text-muted-foreground">{t("shell.title")}</p>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      <div className="page-shell flex min-h-[calc(100vh-76px)] items-center py-12 lg:py-20">
        <div className="grid w-full gap-10 lg:grid-cols-[minmax(0,1fr)_480px] lg:items-center">
          <div className="space-y-6">
            <p className="brand-kicker">Certwarden</p>
            <h1 className="editorial-display max-w-[560px] text-foreground">{t("shell.title")}</h1>
            <p className="editorial-body max-w-[560px]">{t("auth.signInDescription")}</p>
          </div>
          <div className="w-full">{children}</div>
        </div>
      </div>
    </div>
  );
}
