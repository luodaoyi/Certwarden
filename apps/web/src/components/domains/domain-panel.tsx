import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ApiDomain } from "@/lib/types";

function statusVariant(status: ApiDomain["status"]) {
  switch (status) {
    case "healthy":
      return "success";
    case "error":
      return "destructive";
    default:
      return "warning";
  }
}

function SummaryCell({
  label,
  value,
  className,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="section-heading">{label}</p>
      <div className={cn("mt-1 text-sm font-medium text-foreground", valueClassName)}>{value}</div>
    </div>
  );
}

function SummaryDateValue({
  locale,
  value,
  fallback,
}: {
  locale: string;
  value?: string | null;
  fallback: string;
}) {
  if (!value) {
    return <span className="text-sm font-semibold">{fallback}</span>;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return <span className="text-sm font-semibold">{fallback}</span>;
  }

  const dateLabel = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  return (
    <span className="flex flex-col whitespace-nowrap leading-tight">
      <span className="font-semibold">{dateLabel}</span>
      <span className="mt-1 text-[11px] font-medium text-muted-foreground">{timeLabel}</span>
    </span>
  );
}

function DetailTile({
  label,
  value,
  mono = false,
  wide = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-h-[92px] rounded-[18px] border border-border bg-[#fffdf8] px-4 py-4 shadow-[0_0_0_1px_rgba(240,238,230,0.75),0_6px_20px_rgba(20,20,19,0.04)]",
        wide && "md:col-span-2 xl:col-span-3"
      )}
    >
      <p className="section-heading">{label}</p>
      <p className={cn("mt-2 break-words text-sm text-foreground", mono && "font-mono text-[12px]")}>{value}</p>
    </div>
  );
}

export function DomainPanel({
  domain,
  expanded,
  onToggle,
  actions,
  className,
}: {
  domain: ApiDomain;
  expanded: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  className?: string;
}) {
  const { locale, t, formatDateTime } = useI18n();

  const statusLabel = domain.status === "healthy"
    ? t("status.healthy")
    : domain.status === "error"
      ? t("status.error")
      : t("status.pending");

  const dnsNames = domain.cert_dns_names?.length ? domain.cert_dns_names.join(", ") : t("common.none");
  const targetIP = domain.target_ip || t("domains.autoResolve");
  const resolvedIP = domain.resolved_ip || t("common.none");
  const intervalDays = Math.round(domain.check_interval_seconds / 86400);
  const intervalLabel = domain.check_interval_seconds % 86400 === 0
    ? t("domains.intervalPresetDays", { days: intervalDays })
    : `${domain.check_interval_seconds}s`;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-[28px] border border-border bg-card shadow-[0_0_0_1px_rgba(240,238,230,0.85),0_8px_30px_rgba(20,20,19,0.05)]",
        className
      )}
    >
      <div className="px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              aria-expanded={expanded}
              className="flex w-full min-w-0 items-start gap-3 text-left"
              onClick={onToggle}
            >
              <span className="mt-0.5 rounded-full bg-[#efece2] p-1 text-muted-foreground">
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="truncate font-[Georgia,'Times_New_Roman',serif] text-[24px] font-medium leading-[1.15] text-foreground">
                    {domain.hostname}:{domain.port}
                  </h3>
                  <Badge variant={statusVariant(domain.status)}>{statusLabel}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t("common.targetIp")}: {targetIP} · {t("common.resolvedIp")}: {resolvedIP}
                </p>
              </div>
            </button>
          </div>

          {actions ? (
            <div className="flex flex-wrap items-center gap-2 xl:max-w-[340px] xl:justify-end">
              {actions}
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCell
            label={t("common.daysLeft")}
            value={domain.days_remaining ?? t("common.none")}
            className="metric-tile min-h-[84px]"
            valueClassName="whitespace-nowrap text-base font-semibold"
          />
          <SummaryCell
            label={t("common.validTo")}
            className="metric-tile min-h-[84px]"
            value={<SummaryDateValue locale={locale} value={domain.cert_expires_at} fallback={t("common.none")} />}
          />
          <SummaryCell
            label={t("common.lastChecked")}
            className="metric-tile min-h-[84px]"
            value={<SummaryDateValue locale={locale} value={domain.last_checked_at} fallback={t("common.none")} />}
          />
          <SummaryCell
            label={t("domains.checkIntervalCompact")}
            className="metric-tile min-h-[84px]"
            value={intervalLabel}
            valueClassName="whitespace-nowrap text-sm font-semibold"
          />
        </div>
      </div>

      <div className="border-t border-border/70 bg-[#f2efe5] px-4 py-3 sm:px-5">
        <div className="grid gap-3 md:grid-cols-[minmax(240px,2.3fr)_150px_110px_minmax(140px,1fr)] xl:grid-cols-[minmax(260px,2.3fr)_150px_110px_150px]">
          <SummaryCell
            label={t("domains.detectionNotes")}
            value={`${t("common.targetIp")}: ${targetIP} · ${t("common.resolvedIp")}: ${resolvedIP}`}
            valueClassName="truncate text-[13px] font-medium"
          />
          <SummaryCell
            label={t("domains.lastSuccessful")}
            value={<SummaryDateValue locale={locale} value={domain.last_successful_at} fallback={t("common.none")} />}
          />
          <SummaryCell
            label={t("common.signatureAlgorithm")}
            value={domain.cert_signature_algorithm || t("common.none")}
            valueClassName="truncate text-[13px] font-semibold"
          />
          <SummaryCell
            label={t("domains.nextCheck")}
            value={<SummaryDateValue locale={locale} value={domain.next_check_at} fallback={t("common.none")} />}
          />
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-border/70 bg-[#ebe7dc] p-4 sm:p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_340px]">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <DetailTile label={t("common.validFrom")} value={formatDateTime(domain.cert_valid_from)} />
              <DetailTile label={t("common.validTo")} value={formatDateTime(domain.cert_expires_at)} />
              <DetailTile label={t("domains.nextCheck")} value={formatDateTime(domain.next_check_at)} />
              <DetailTile label={t("common.lastChecked")} value={formatDateTime(domain.last_checked_at)} />
              <DetailTile label={t("domains.lastSuccessful")} value={formatDateTime(domain.last_successful_at)} />
              <DetailTile label={t("common.signatureAlgorithm")} value={domain.cert_signature_algorithm || t("common.none")} />
              <DetailTile label={t("common.commonName")} value={domain.cert_common_name || t("common.none")} />
              <DetailTile label={t("common.serialNumber")} value={domain.cert_serial_number || t("common.none")} mono />
              <DetailTile label={t("common.issuer")} value={domain.cert_issuer || t("common.none")} wide />
              <DetailTile label={t("common.subject")} value={domain.cert_subject || t("common.none")} wide />
              <DetailTile label={t("common.san")} value={dnsNames} wide />
              <DetailTile label={t("common.fingerprint")} value={domain.cert_fingerprint_sha256 || t("common.none")} mono wide />
            </div>

            <div className="space-y-3">
              {domain.last_error ? (
                <div className="rounded-[18px] border border-destructive/30 bg-[#faecec] px-4 py-4">
                  <p className="section-heading text-destructive">{t("status.error")}</p>
                  <p className="mt-2 text-sm text-destructive">{domain.last_error}</p>
                </div>
              ) : null}

              <div className="info-panel">
                <p className="section-heading">{t("domains.detectionNotes")}</p>
                <div className="mt-3 space-y-2 text-sm text-foreground">
                  <p>{t("domains.targetIpSummary", { value: targetIP })}</p>
                  <p>{t("domains.resolvedIpSummary", { value: resolvedIP })}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
