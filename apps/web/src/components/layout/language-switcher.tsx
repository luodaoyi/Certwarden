import { Languages } from "lucide-react";

import { localeOptions, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <label
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-2 rounded-[12px] px-3.5 text-[14px] shadow-[0_0_0_1px_rgba(240,238,230,0.8)]",
        tone === "dark"
          ? "border border-[#4a4945] bg-[#30302e] text-[#faf9f5]"
          : "border border-border bg-[#fffdf8] text-muted-foreground"
      )}
    >
      <Languages className="h-4 w-4" />
      <span className="sr-only">{t("common.language")}</span>
      <select
        aria-label={t("common.language")}
        className={cn("min-w-0 bg-transparent outline-none", tone === "dark" ? "text-[#faf9f5]" : "text-foreground")}
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
