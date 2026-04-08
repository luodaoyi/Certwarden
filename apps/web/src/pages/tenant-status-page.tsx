import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { DomainPanel } from "@/components/domains/domain-panel";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { resolvePublicStatusSubtitle, resolvePublicStatusTitle } from "@/lib/public-status";
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

  const pageTitle = resolvePublicStatusTitle(payload?.tenant, t("statusPage.titleFallback"));
  const pageSubtitle = resolvePublicStatusSubtitle(payload?.tenant, t("statusPage.subtitleFallback"));

  return (
    <div className="min-h-screen bg-background">
      <header className="warm-topbar sticky top-0 z-40">
        <div className="page-shell flex items-center justify-between py-4">
          <div className="space-y-1">
            <p className="brand-kicker">Certwarden</p>
            <p className="text-[14px] text-muted-foreground">{t("statusPage.titleFallback")}</p>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Button variant="command" onClick={() => { window.location.href = "/login"; }}>
              {t("statusPage.signIn")}
            </Button>
          </div>
        </div>
      </header>

      <div className="page-shell space-y-8 py-8 lg:py-10">
        <section className="rounded-[36px] border border-[#30302e] bg-[#141413] px-7 py-10 text-[#faf9f5] shadow-[0_0_0_1px_rgba(48,48,46,0.92),0_20px_48px_rgba(20,20,19,0.16)] lg:px-10 lg:py-12">
          <div className="max-w-4xl space-y-5">
            <p className="brand-kicker text-[#d97757]">Certwarden</p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="editorial-display text-[#faf9f5]">{pageTitle}</h1>
              {payload ? <Badge variant={statusVariant(payload.summary.overall_status)}>{overallStatusLabel}</Badge> : null}
            </div>
            <p className="max-w-3xl text-[17px] leading-[1.6] text-[#b0aea5]">{pageSubtitle}</p>
          </div>
        </section>

        {statusQuery.isLoading ? <p>{t("common.loadingDomains")}</p> : null}

        {payload ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardContent>
                  <p className="section-heading">{t("statusPage.totalMonitors")}</p>
                  <p className="mt-3 text-[32px] font-semibold leading-none tracking-[-0.4px]">{payload.summary.domain_count}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <p className="section-heading">{t("statusPage.healthyMonitors")}</p>
                  <p className="mt-3 text-[32px] font-semibold leading-none tracking-[-0.4px]">{payload.summary.healthy_count}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <p className="section-heading">{t("statusPage.pendingMonitors")}</p>
                  <p className="mt-3 text-[32px] font-semibold leading-none tracking-[-0.4px]">{payload.summary.pending_count + payload.summary.error_count}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <p className="section-heading">{t("statusPage.nextExpiry")}</p>
                  <p className="mt-3 text-[15px] font-semibold">{formatDateTime(payload.summary.next_expiry_at)}</p>
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
