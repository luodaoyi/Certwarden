import type { ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { deriveDaysFromCertExpiry } from "@/lib/certificate-age";
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

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 border-b border-border/60 py-1.5 last:border-b-0 sm:grid sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-3">
      <p className="section-heading">{label}</p>
      <p className={cn("mt-0.5 break-words text-[13px] text-foreground sm:mt-0", mono && "font-mono text-[12px]")}>{value}</p>
    </div>
  );
}

function DaysCell({ days, noneLabel, remainingLabel, overdueLabel }: {
  days: number | null;
  noneLabel: string;
  remainingLabel: (days: number) => string;
  overdueLabel: (days: number) => string;
}) {
  if (days === null) {
    return <span className="text-sm font-semibold text-muted-foreground">{noneLabel}</span>;
  }

  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-destructive">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {overdueLabel(Math.abs(days))}
      </span>
    );
  }

  return <span className="text-sm font-semibold tabular-nums text-foreground">{remainingLabel(days)}</span>;
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
  const { t, formatDateTime } = useI18n();

  const statusLabel = domain.status === "healthy"
    ? t("status.healthy")
    : domain.status === "error"
      ? t("status.error")
      : t("status.pending");

  const dnsNames = domain.cert_dns_names?.length ? domain.cert_dns_names.join(", ") : t("common.none");
  const targetIP = domain.target_ip || t("domains.autoResolve");
  const resolvedIP = domain.resolved_ip || t("common.none");
  const intervalDays = Math.round(domain.check_interval_seconds / 86400);
  const intervalHours = Math.round(domain.check_interval_seconds / 3600);
  const intervalLabel = domain.check_interval_seconds % 86400 === 0
    ? t("domains.intervalPresetDays", { days: intervalDays })
    : domain.check_interval_seconds % 3600 === 0
      ? t("domains.intervalPresetHours", { hours: intervalHours })
      : `${domain.check_interval_seconds}s`;

  const derivedDays = deriveDaysFromCertExpiry(domain.cert_expires_at);
  const isOverdue = derivedDays !== null && derivedDays < 0;
  const isError = domain.status === "error";
  const exactExpiry = domain.cert_expires_at ? formatDateTime(domain.cert_expires_at) : t("common.none");

  return (
    <article
      className={cn(
        "overflow-hidden bg-card",
        isError || isOverdue
          ? "bg-[#fff1ef]"
          : "bg-card",
        className
      )}
      data-status={domain.status}
      data-overdue={isOverdue ? "true" : "false"}
    >
      <div className="px-3 py-2.5 sm:px-4">
        <div className="flex flex-col gap-2 lg:grid lg:grid-cols-[minmax(0,1.6fr)_88px_minmax(150px,1.1fr)_minmax(100px,0.8fr)_auto] lg:items-center lg:gap-3">
          <div className="flex min-w-0 items-start gap-2 text-left">
            <button
              type="button"
              aria-label={domain.hostname}
              aria-expanded={expanded}
              className="-ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onToggle}
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold leading-tight text-foreground">
                <span className="cursor-text select-text">{domain.hostname}</span>
                <span className="font-medium text-muted-foreground">:{domain.port}</span>
              </span>
              <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                {t("common.targetIp")}: {targetIP} · {t("common.resolvedIp")}: {resolvedIP}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-2 pl-6 lg:pl-0">
            <Badge variant={statusVariant(domain.status)} className="px-2 py-0.5 text-[10px]">
              {isOverdue ? t("common.expired") : statusLabel}
            </Badge>
          </div>

          <div className="min-w-0 pl-6 lg:pl-0">
            <p className="section-heading lg:hidden">{t("common.validTo")}</p>
            <p
              className={cn(
                "truncate text-[13px] font-medium tabular-nums",
                isOverdue ? "text-destructive" : "text-foreground"
              )}
              title={exactExpiry}
            >
              {exactExpiry}
            </p>
          </div>

          <div className="min-w-0 pl-6 lg:pl-0">
            <p className="section-heading lg:hidden">{t("common.daysLeft")}</p>
            <DaysCell
              days={derivedDays}
              noneLabel={t("common.none")}
              remainingLabel={(days) => t("common.daysRemainingValue", { days })}
              overdueLabel={(days) => t("common.daysOverdue", { days })}
            />
          </div>

          {actions ? (
            <div className="flex flex-wrap items-center gap-1.5 pl-6 lg:justify-end lg:pl-0">
              {actions}
            </div>
          ) : null}
        </div>

        {isError && domain.last_error ? (
          <p className="mt-2 flex items-start gap-1.5 rounded border border-destructive/25 bg-[#faecec] px-2.5 py-1.5 text-[12px] text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{domain.last_error}</span>
          </p>
        ) : null}
      </div>

      {expanded ? (
        <div className="border-t border-border/70 bg-[#f7f4ea] px-3 py-3 sm:px-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="rounded-lg border border-border/70 bg-[#fffdf8] px-3 py-1">
              <DetailRow label={t("common.validFrom")} value={formatDateTime(domain.cert_valid_from)} />
              <DetailRow label={t("common.validTo")} value={formatDateTime(domain.cert_expires_at)} />
              <DetailRow label={t("common.lastChecked")} value={formatDateTime(domain.last_checked_at)} />
              <DetailRow label={t("domains.lastSuccessful")} value={formatDateTime(domain.last_successful_at)} />
              <DetailRow label={t("domains.nextCheck")} value={formatDateTime(domain.next_check_at)} />
              <DetailRow label={t("domains.checkIntervalCompact")} value={intervalLabel} />
              <DetailRow label={t("common.commonName")} value={domain.cert_common_name || t("common.none")} />
              <DetailRow label={t("common.issuer")} value={domain.cert_issuer || t("common.none")} />
              <DetailRow label={t("common.subject")} value={domain.cert_subject || t("common.none")} />
              <DetailRow label={t("common.san")} value={dnsNames} />
              <DetailRow label={t("common.serialNumber")} value={domain.cert_serial_number || t("common.none")} mono />
              <DetailRow label={t("common.signatureAlgorithm")} value={domain.cert_signature_algorithm || t("common.none")} />
              <DetailRow label={t("common.fingerprint")} value={domain.cert_fingerprint_sha256 || t("common.none")} mono />
            </div>

            <div className="space-y-2 text-[13px]">
              <div className="rounded-lg border border-border/70 bg-[#fffdf8] px-3 py-2">
                <p className="section-heading">{t("domains.detectionNotes")}</p>
                <p className="mt-1.5 text-foreground">{t("domains.targetIpSummary", { value: targetIP })}</p>
                <p className="mt-1 text-foreground">{t("domains.resolvedIpSummary", { value: resolvedIP })}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
