import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, LoaderCircle, Plus, RefreshCw, Settings2 } from "lucide-react";

import { DomainForm, type DomainPayload } from "@/components/domains/domain-form";
import { DomainPanel } from "@/components/domains/domain-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { sortDomainsByCertExpiryAsc } from "@/lib/certificate-age";
import { useI18n } from "@/lib/i18n";
import type { ApiDomain, DomainStatus, PublicTenantStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "warning";

type ToastState = {
  message: string;
  tone: ToastTone;
};

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

function MetricChip({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "danger" | "ok";
}) {
  return (
    <div
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-lg border px-2.5 py-1.5",
        tone === "danger" && "border-destructive/30 bg-[#faecec]",
        tone === "ok" && "border-[#cfe4d2] bg-[#edf5ee]",
        tone === "default" && "border-border bg-[#fffdf8]"
      )}
    >
      <span className="section-heading !tracking-[0.08em]">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function DashboardToast({
  toast,
  onDismiss,
}: {
  toast: ToastState;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 4500);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      data-tone={toast.tone}
      className={cn(
        "fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border px-3 py-2.5 text-sm shadow-[0_8px_24px_rgba(20,20,19,0.12)]",
        toast.tone === "success" && "border-[#cfe4d2] bg-[#edf5ee] text-[#1f3d24]",
        toast.tone === "error" && "border-destructive/30 bg-[#faecec] text-[#5c1f1f]",
        toast.tone === "warning" && "border-[#e8d7b0] bg-[#fff8e8] text-[#5c4a1f]"
      )}
    >
      {toast.message}
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const { t, formatDateTime } = useI18n();
  const queryClient = useQueryClient();
  const [editingDomain, setEditingDomain] = useState<ApiDomain | null>(null);
  const [expandedDomainId, setExpandedDomainId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone) => {
    setToast({ message, tone });
  }, []);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  const domainsQuery = useQuery({
    queryKey: ["domains"],
    queryFn: () => apiRequest<{ domains: ApiDomain[] }>("/domains"),
  });

  const publicStatusQuery = useQuery({
    queryKey: ["workspace-public-status", user?.tenant_id],
    enabled: Boolean(user?.tenant_id),
    queryFn: () => apiRequest<PublicTenantStatus>(`/public/tenants/${user?.tenant_id}/status`, undefined, false),
  });

  const refreshMonitoringData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["domains"] }),
      queryClient.invalidateQueries({ queryKey: ["workspace-public-status", user?.tenant_id] }),
    ]);
  }, [queryClient, user?.tenant_id]);

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
      setShowAddForm(false);
      await refreshMonitoringData();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/domains/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refreshMonitoringData();
    },
  });

  const checkMutation = useMutation({
    mutationFn: (id: number) => apiRequest<{ domain: ApiDomain }>(`/domains/${id}/check`, { method: "POST" }),
    onSuccess: async () => {
      await refreshMonitoringData();
    },
  });

  // Sort a copy for display only; query cache / API arrays stay untouched.
  const domains = useMemo(
    () => sortDomainsByCertExpiryAsc(domainsQuery.data?.domains ?? []),
    [domainsQuery.data],
  );
  const checkingDomainId = checkMutation.isPending ? checkMutation.variables : null;
  const publicStatus = publicStatusQuery.data;
  const overallStatus = publicStatus?.summary.overall_status ?? "pending";
  const overallStatusLabel = overallStatus === "healthy"
    ? t("status.healthy")
    : overallStatus === "error"
      ? t("status.error")
      : t("status.pending");

  const domainCount = publicStatus?.summary.domain_count ?? domains.length;
  const healthyCount = publicStatus?.summary.healthy_count ?? 0;
  const pendingCount = publicStatus?.summary.pending_count ?? 0;
  const errorCount = publicStatus?.summary.error_count ?? 0;
  const formVisible = showAddForm || editingDomain !== null;
  const checkAllDisabled = domains.length === 0 || isCheckingAll || checkMutation.isPending;

  const handleCheckAll = async () => {
    if (checkAllDisabled) return;

    setIsCheckingAll(true);
    try {
      const results = await Promise.allSettled(
        domains.map((domain) =>
          apiRequest<{ domain: ApiDomain }>(`/domains/${domain.id}/check`, { method: "POST" })
        )
      );
      const successCount = results.filter((result) => result.status === "fulfilled").length;
      const failedCount = results.length - successCount;

      if (failedCount === 0) {
        showToast(t("dashboard.checkAllSuccess", { count: successCount }), "success");
      } else if (successCount === 0) {
        showToast(t("dashboard.checkAllFailed", { count: failedCount }), "error");
      } else {
        showToast(
          t("dashboard.checkAllPartial", {
            success: successCount,
            total: results.length,
            failed: failedCount,
          }),
          "warning"
        );
      }

      await refreshMonitoringData();
    } finally {
      setIsCheckingAll(false);
    }
  };

  const handleDomainSave = async (values: DomainPayload) => {
    const isEdit = Boolean(editingDomain);
    try {
      await saveMutation.mutateAsync({ id: editingDomain?.id, values });
      showToast(
        isEdit ? t("dashboard.domainUpdatedSuccess") : t("dashboard.domainAddedSuccess"),
        "success"
      );
    } catch (error) {
      showToast(t("dashboard.domainSaveError"), "error");
      // Re-throw so DomainForm can keep field values and avoid treating failure as success.
      throw error;
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <section
        data-testid="monitoring-overview"
        className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-[0_0_0_1px_rgba(240,238,230,0.85)] sm:px-4"
      >
        <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="brand-kicker mr-1">{t("dashboard.overviewTitle")}</p>
            {publicStatusQuery.isLoading ? (
              <span className="text-sm text-muted-foreground">{t("dashboard.loadingOverview")}</span>
            ) : (
              <>
                <MetricChip
                  label={t("dashboard.overallStatus")}
                  value={<Badge variant={statusVariant(overallStatus)} className="px-2 py-0.5 text-[10px]">{overallStatusLabel}</Badge>}
                  tone={overallStatus === "error" ? "danger" : overallStatus === "healthy" ? "ok" : "default"}
                />
                <MetricChip label={t("statusPage.totalMonitors")} value={domainCount} />
                <MetricChip label={t("statusPage.healthyMonitors")} value={healthyCount} tone="ok" />
                <MetricChip label={t("statusPage.pendingMonitors")} value={pendingCount} />
                <MetricChip
                  label={t("admin.errorCountLabel")}
                  value={errorCount}
                  tone={errorCount > 0 ? "danger" : "default"}
                />
                <MetricChip
                  label={t("statusPage.nextExpiry")}
                  value={<span className="max-w-[200px] truncate text-[13px]">{formatDateTime(publicStatus?.summary.next_expiry_at)}</span>}
                />
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-[#fffdf8] px-3 text-[13px] font-medium text-foreground shadow-[0_0_0_1px_rgba(240,238,230,0.8)] transition hover:bg-[#f3f0e6]"
              href={publicStatus?.public_url ?? "#"}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              {t("dashboard.openPublicPage")}
            </a>
            <Link
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary px-3 text-[13px] font-medium text-secondary-foreground shadow-[0_0_0_1px_rgba(209,207,197,0.8)] transition hover:bg-[#e1dfd3]"
              to="/app/settings"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t("dashboard.customizePublicPage")}
            </Link>
            <Button
              size="sm"
              className="h-8 rounded-lg"
              onClick={() => {
                setEditingDomain(null);
                setShowAddForm((open) => !open);
              }}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {showAddForm && !editingDomain ? t("dashboard.hideAddDomain") : t("dashboard.showAddDomain")}
            </Button>
          </div>
        </div>
      </section>

      {formVisible ? (
        <Card className="rounded-lg shadow-[0_0_0_1px_rgba(240,238,230,0.85)]">
          <CardHeader className="gap-1 px-4 pt-4 pb-1 sm:px-5 sm:pt-4">
            <CardTitle className="text-[20px]">{editingDomain ? t("domains.editTitle") : t("domains.addTitle")}</CardTitle>
            <CardDescription className="text-[13px]">{t("domains.formDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-4 py-4 sm:px-5">
            <DomainForm
              domain={editingDomain ?? undefined}
              submitLabel={editingDomain ? t("domains.saveButton") : t("domains.addButton")}
              onSubmit={handleDomainSave}
              onCancel={() => {
                setEditingDomain(null);
                setShowAddForm(false);
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      <section
        data-testid="certificate-table"
        className="overflow-hidden rounded-lg border border-border bg-card shadow-[0_0_0_1px_rgba(240,238,230,0.85)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2 sm:px-4">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">{t("dashboard.certificateTable")}</h2>
            <p className="text-[12px] text-muted-foreground">{t("domains.managedDescription")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded-lg px-2.5 text-[12px]"
              disabled={checkAllDisabled}
              aria-busy={isCheckingAll}
              onClick={() => void handleCheckAll()}
            >
              {isCheckingAll ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {isCheckingAll ? t("dashboard.checkingAll") : t("dashboard.checkAll")}
            </Button>
            <span className="text-[12px] tabular-nums text-muted-foreground">{domainCount}</span>
          </div>
        </div>

        <div className="hidden border-b border-border/60 bg-[#f7f4ea] px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[#87867f] lg:grid lg:grid-cols-[minmax(0,1.6fr)_88px_minmax(150px,1.1fr)_minmax(100px,0.8fr)_auto] lg:gap-3">
          <span>{t("common.hostname")}</span>
          <span>{t("common.status")}</span>
          <span>{t("common.validTo")}</span>
          <span>{t("common.daysLeft")}</span>
          <span className="text-right">{t("common.actions")}</span>
        </div>

        <div className="divide-y divide-border/70">
          {domainsQuery.isLoading ? <p className="px-1 text-sm text-muted-foreground">{t("common.loadingDomains")}</p> : null}
          {!domainsQuery.isLoading && domains.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">{t("domains.empty")}</p>
          ) : null}
          {domains.map((domain) => {
            const isChecking = checkingDomainId === domain.id;

            return (
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
                      className="h-7 rounded-lg px-2.5 text-[12px]"
                      onClick={() => {
                        setEditingDomain(domain);
                        setShowAddForm(false);
                        setExpandedDomainId(domain.id);
                      }}
                    >
                      {t("common.edit")}
                    </Button>
                    <Button
                      variant="command"
                      size="sm"
                      aria-busy={isChecking}
                      disabled={checkMutation.isPending || isCheckingAll}
                      className={cn(
                        "h-7 min-w-[96px] rounded-lg px-2.5 text-[12px]",
                        isChecking && "border-[#d97757] bg-[#f2c4b1] text-[#2e1911] shadow-[0_0_0_1px_rgba(217,119,87,0.45)]"
                      )}
                      onClick={() => void checkMutation.mutateAsync(domain.id)}
                    >
                      {isChecking ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                      {isChecking ? t("common.checking") : t("common.checkNow")}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-7 rounded-lg px-2.5 text-[12px]"
                      onClick={() => void deleteMutation.mutateAsync(domain.id)}
                    >
                      {t("common.delete")}
                    </Button>
                  </>
                )}
              />
            );
          })}
        </div>
      </section>

      {toast ? <DashboardToast toast={toast} onDismiss={dismissToast} /> : null}
    </div>
  );
}
