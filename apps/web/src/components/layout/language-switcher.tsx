import { Languages } from "lucide-react";

import { localeOptions, useI18n } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className="inline-flex h-11 shrink-0 items-center gap-2 border border-border bg-card px-3 text-sm text-muted-foreground">
      <Languages className="h-4 w-4" />
      <span className="sr-only">{t("common.language")}</span>
      <select
        aria-label={t("common.language")}
        className="min-w-0 bg-transparent text-sm text-foreground outline-none"
        value={locale}
        onChange={(event) => setLocale(event.target.value as (typeof localeOptions)[number]["value"])}
      >
        {localeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
