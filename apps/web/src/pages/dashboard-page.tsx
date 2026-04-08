import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { DomainForm, type DomainPayload } from "@/components/domains/domain-form";
import { DomainPanel } from "@/components/domains/domain-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { resolvePublicStatusSubtitle, resolvePublicStatusTitle } from "@/lib/public-status";
import type { ApiDomain, DomainStatus, PublicTenantStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

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

function OverviewTile({
  label,
  value,
  className,
  valueClassName,
  labelClassName,
}: {
  label: string;
  value: ReactNode;
  className?: string;
  valueClassName?: string;
  labelClassName?: string;
}) {
  return (
    <div className={`metric-tile min-h-[96px] ${className ?? ""}`}>
      <p className={cn("section-heading", !labelClassName && "text-muted-foreground", labelClassName)}>{label}</p>
      <div className={cn("mt-3 text-lg font-semibold", !valueClassName && "text-foreground", valueClassName)}>{value}</div>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const { t, formatDateTime } = useI18n();
  const queryClient = useQueryClient();
  const [editingDomain, setEditingDomain] = useState<ApiDomain | null>(null);
  const [expandedDomainId, setExpandedDomainId] = useState<number | null>(null);

  const domainsQuery = useQuery({
    queryKey: ["domains"],
    queryFn: () => apiRequest<{ domains: ApiDomain[] }>("/domains"),
  });

  const publicStatusQuery = useQuery({
    queryKey: ["workspace-public-status", user?.tenant_id],
    enabled: Boolean(user?.tenant_id),
    queryFn: () => apiRequest<PublicTenantStatus>(`/public/tenants/${user?.tenant_id}/status`, undefined, false),
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: { id?: number; values: DomainPayload }) => {
      if (payload.id) {
        return apiRequest<{ domain: ApiDomain }>(`/domains/${payload.id}`, {
          method: "PUT",
          body: JSON.stringify(payload.values),
        });
      }
      return apiRequest<{ domain: ApiDomain }>("/domains", {
        method: "POST",
        body: JSON.stringify(payload.values),
      });
    },
    onSuccess: async () => {
      setEditingDomain(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["domains"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-public-status", user?.tenant_id] }),
      ]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/domains/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["domains"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-public-status", user?.tenant_id] }),
      ]);
    },
  });

  const checkMutation = useMutation({
    mutationFn: (id: number) => apiRequest<{ domain: ApiDomain }>(`/domains/${id}/check`, { method: "POST" }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["domains"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-public-status", user?.tenant_id] }),
      ]);
    },
  });

  const domains = useMemo(() => domainsQuery.data?.domains ?? [], [domainsQuery.data]);
  const publicStatus = publicStatusQuery.data;
  const effectivePublicTitle = resolvePublicStatusTitle(publicStatus?.tenant, t("statusPage.titleFallback"));
  const effectivePublicSubtitle = resolvePublicStatusSubtitle(publicStatus?.tenant, t("statusPage.subtitleFallback"));
  const overallStatus = publicStatus?.summary.overall_status ?? "pending";
  const overallStatusLabel = overallStatus === "healthy"
    ? t("status.healthy")
    : overallStatus === "error"
      ? t("status.error")
      : t("status.pending");

  return (
    <div className="space-y-6">
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.6fr)_360px] 2xl:items-start">
        <Card className="border-[#30302e] bg-[#141413] text-[#faf9f5] shadow-[0_0_0_1px_rgba(48,48,46,0.92),0_18px_48px_rgba(20,20,19,0.14)]">
          <CardHeader>
            <p className="brand-kicker text-[#d97757]">{t("dashboard.overviewTitle")}</p>
            <CardTitle className="text-[32px] text-[#faf9f5]">{t("dashboard.overviewTitle")}</CardTitle>
            <CardDescription className="max-w-2xl text-[#b0aea5]">{t("dashboard.overviewDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {publicStatusQuery.isLoading ? <p className="text-sm text-[#b0aea5]">{t("dashboard.loadingOverview")}</p> : null}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <OverviewTile
                label={t("dashboard.overallStatus")}
                className="border-[#3b3b37] bg-[#1f1f1d] shadow-none"
                labelClassName="text-[#b0aea5]"
                valueClassName="text-[#faf9f5]"
                value={<Badge variant={statusVariant(overallStatus)}>{overallStatusLabel}</Badge>}
              />
              <OverviewTile
                label={t("statusPage.nextExpiry")}
                className="border-[#3b3b37] bg-[#1f1f1d] shadow-none xl:col-span-2"
                labelClassName="text-[#b0aea5]"
                valueClassName="text-sm text-[#faf9f5] xl:whitespace-nowrap xl:text-base"
                value={formatDateTime(publicStatus?.summary.next_expiry_at)}
              />
              <OverviewTile
                label={t("statusPage.totalMonitors")}
                className="border-[#3b3b37] bg-[#1f1f1d] shadow-none"
                labelClassName="text-[#b0aea5]"
                valueClassName="text-[#faf9f5]"
                value={publicStatus?.summary.domain_count ?? domains.length}
              />
              <OverviewTile
                label={t("statusPage.healthyMonitors")}
                className="border-[#3b3b37] bg-[#1f1f1d] shadow-none"
                labelClassName="text-[#b0aea5]"
                valueClassName="text-[#faf9f5]"
                value={publicStatus?.summary.healthy_count ?? 0}
              />
              <OverviewTile
                label={t("statusPage.pendingMonitors")}
                className="border-[#3b3b37] bg-[#1f1f1d] shadow-none"
                labelClassName="text-[#b0aea5]"
                valueClassName="text-[#faf9f5]"
                value={publicStatus?.summary.pending_count ?? 0}
              />
              <OverviewTile
                label={t("admin.errorCountLabel")}
                className="border-[#3b3b37] bg-[#1f1f1d] shadow-none"
                labelClassName="text-[#b0aea5]"
                valueClassName="text-[#faf9f5]"
                value={publicStatus?.summary.error_count ?? 0}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>{t("dashboard.publicPageTitle")}</CardTitle>
            <CardDescription>{t("dashboard.publicPageDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="info-panel">
              <p className="section-heading">{t("dashboard.currentHeadline")}</p>
              <p className="mt-2 text-base font-semibold text-foreground">{effectivePublicTitle}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{effectivePublicSubtitle}</p>
            </div>

            <div className="info-panel">
              <p className="section-heading">{t("dashboard.publicUrl")}</p>
              <a className="mt-2 block truncate text-sm font-medium text-primary" href={publicStatus?.public_url ?? "#"} target="_blank" rel="noreferrer">
                {publicStatus?.public_url ?? t("common.none")}
              </a>
            </div>

            <div className="action-row">
              <a
                className="inline-flex h-10 items-center justify-center rounded-[12px] border border-border bg-[#fffdf8] px-4 text-[14px] font-medium text-foreground shadow-[0_0_0_1px_rgba(240,238,230,0.8)] transition hover:bg-[#f3f0e6]"
                href={publicStatus?.public_url ?? "#"}
                target="_blank"
                rel="noreferrer"
              >
                {t("dashboard.openPublicPage")}
              </a>
              <Link className="inline-flex h-10 items-center justify-center rounded-[12px] border border-border bg-secondary px-4 text-[14px] font-medium text-secondary-foreground shadow-[0_0_0_1px_rgba(209,207,197,0.8)] transition hover:bg-[#e1dfd3]" to="/app/settings">
                {t("dashboard.customizePublicPage")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{editingDomain ? t("domains.editTitle") : t("domains.addTitle")}</CardTitle>
          <CardDescription>{t("domains.formDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <DomainForm
            domain={editingDomain ?? undefined}
            submitLabel={editingDomain ? t("domains.saveButton") : t("domains.addButton")}
            onSubmit={async (values) => {
              await saveMutation.mutateAsync({ id: editingDomain?.id, values });
            }}
            onCancel={editingDomain ? () => setEditingDomain(null) : undefined}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("domains.managedTitle")}</CardTitle>
          <CardDescription>{t("domains.managedDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {domainsQuery.isLoading ? <p>{t("common.loadingDomains")}</p> : null}
          {domains.length === 0 ? <p className="text-sm text-muted-foreground">{t("domains.empty")}</p> : null}
          {domains.length > 0 ? (
            <div className="space-y-3">
              {domains.map((domain) => (
                <DomainPanel
                  key={domain.id}
                  domain={domain}
                  expanded={expandedDomainId === domain.id}
                  onToggle={() => setExpandedDomainId((current) => (current === domain.id ? null : domain.id))}
                  actions={(
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingDomain(domain);
                          setExpandedDomainId(domain.id);
                        }}
                      >
                        {t("common.edit")}
                      </Button>
                      <Button variant="command" size="sm" onClick={() => void checkMutation.mutateAsync(domain.id)}>{t("common.checkNow")}</Button>
                      <Button variant="destructive" size="sm" onClick={() => void deleteMutation.mutateAsync(domain.id)}>{t("common.delete")}</Button>
                    </>
                  )}
                />
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
