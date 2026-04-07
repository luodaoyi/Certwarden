import type { ReactNode } from "react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useI18n } from "@/lib/i18n";

export function PublicPageShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();

  return (
    <div className="page-shell relative flex min-h-screen items-center justify-center">
      <div className="absolute left-4 top-6 sm:left-6 lg:left-8">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">Certwarden</p>
        <p className="text-sm text-muted-foreground">{t("shell.title")}</p>
      </div>
      <div className="absolute right-4 top-6 sm:right-6 lg:right-8">
        <LanguageSwitcher />
      </div>
      {children}
    </div>
  );
}
