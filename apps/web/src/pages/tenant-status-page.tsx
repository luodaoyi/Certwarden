import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { DomainPanel } from "@/components/domains/domain-panel";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { DomainStatus, PublicTenantStatus } from "@/lib/types";

function statusVariant(status: DomainStatus) {
  switch (status) {
    case "healthy":
      return "success";
    case "error":
      return "destructive";
    default:
      return "warning";
  }
}

export function TenantStatusPage() {
  const { tenantId } = useParams();
  const { t, formatDateTime } = useI18n();
  const [expandedDomainId, setExpandedDomainId] = useState<number | null>(null);

  const statusQuery = useQuery({
    queryKey: ["public-tenant-status", tenantId],
    enabled: Boolean(tenantId),
    queryFn: () => apiRequest<PublicTenantStatus>(`/public/tenants/${tenantId}/status`, undefined, false),
  });

  const payload = statusQuery.data;
  const overallStatusLabel = useMemo(() => {
    const status = payload?.summary.overall_status ?? "pending";
    if (status === "healthy") return t("status.healthy");
    if (status === "error") return t("status.error");
    return t("status.pending");
  }, [payload?.summary.overall_status, t]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="page-shell flex flex-col gap-4 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Certwarden</p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-[0.01em]">
                {payload?.tenant.name || t("statusPage.titleFallback")}
              </h1>
              {payload ? <Badge variant={statusVariant(payload.summary.overall_status)}>{overallStatusLabel}</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">{t("statusPage.subtitle", { tenantId: tenantId ?? "—" })}</p>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link className="inline-flex h-11 items-center justify-center border border-border bg-background px-4 text-sm font-semibold tracking-[0.06em] text-foreground transition hover:bg-secondary" to="/login">
              {t("statusPage.signIn")}
            </Link>
          </div>
        </div>
      </header>

      <div className="page-shell space-y-6">
        {statusQuery.isLoading ? <p>{t("common.loadingDomains")}</p> : null}

        {payload ? (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("statusPage.totalMonitors")}</p>
                  <p className="text-3xl font-semibold">{payload.summary.domain_count}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("statusPage.healthyMonitors")}</p>
                  <p className="text-3xl font-semibold">{payload.summary.healthy_count}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("statusPage.pendingMonitors")}</p>
                  <p className="text-3xl font-semibold">{payload.summary.pending_count}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("statusPage.nextExpiry")}</p>
                  <p className="text-sm font-semibold">{formatDateTime(payload.summary.next_expiry_at)}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{t("statusPage.domainOverview")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {payload.domains.length === 0 ? <p className="text-sm text-muted-foreground">{t("statusPage.empty")}</p> : null}
                {payload.domains.map((domain) => (
                  <DomainPanel
                    key={domain.id}
                    domain={domain}
                    expanded={expandedDomainId === domain.id}
                    onToggle={() => setExpandedDomainId((current) => (current === domain.id ? null : domain.id))}
                  />
                ))}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}
