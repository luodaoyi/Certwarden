import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { EndpointForm, type EndpointPayload } from "@/components/notifications/endpoint-form";
import { PolicyForm, type PolicyPayload } from "@/components/notifications/policy-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error";
import { useI18n } from "@/lib/i18n";
import type { ApiDomain, ApiEndpoint, TenantPolicies } from "@/lib/types";

function OverviewTile({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="metric-tile min-h-[96px]">
      <p className="section-heading">{label}</p>
      <div className="mt-3 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

export function NotificationsPage() {
  const { t, formatDateTime } = useI18n();
  const getApiErrorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [editingEndpoint, setEditingEndpoint] = useState<ApiEndpoint | null>(null);
  const [selectedDomainId, setSelectedDomainId] = useState<number | null>(null);
  const [endpointMessage, setEndpointMessage] = useState<string | null>(null);
  const [endpointError, setEndpointError] = useState<string | null>(null);

  const endpointsQuery = useQuery({
    queryKey: ["notification-endpoints"],
    queryFn: () => apiRequest<{ endpoints: ApiEndpoint[] }>("/notification-endpoints"),
  });
  const domainsQuery = useQuery({
    queryKey: ["domains"],
    queryFn: () => apiRequest<{ domains: ApiDomain[] }>("/domains"),
  });
  const policiesQuery = useQuery({
    queryKey: ["notification-policies"],
    queryFn: () => apiRequest<TenantPolicies>("/notification-policies"),
  });

  const saveEndpointMutation = useMutation({
    mutationFn: async (payload: { id?: number; values: EndpointPayload }) => {
      if (payload.id) {
        return apiRequest<{ endpoint: ApiEndpoint }>(`/notification-endpoints/${payload.id}`, {
          method: "PUT",
          body: JSON.stringify(payload.values),
        });
      }
      return apiRequest<{ endpoint: ApiEndpoint }>("/notification-endpoints", {
        method: "POST",
        body: JSON.stringify(payload.values),
      });
    },
    onSuccess: async () => {
      setEndpointError(null);
      setEndpointMessage(editingEndpoint ? t("notifications.endpointUpdatedSuccess") : t("notifications.endpointCreatedSuccess"));
      setEditingEndpoint(null);
      await queryClient.invalidateQueries({ queryKey: ["notification-endpoints"] });
    },
  });

  const deleteEndpointMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/notification-endpoints/${id}`, { method: "DELETE" }),
    onSuccess: async (_, id) => {
      setEndpointError(null);
      setEndpointMessage(t("notifications.endpointDeletedSuccess"));
      if (editingEndpoint?.id === id) {
        setEditingEndpoint(null);
      }
      await queryClient.invalidateQueries({ queryKey: ["notification-endpoints"] });
      await queryClient.invalidateQueries({ queryKey: ["notification-policies"] });
    },
  });

  const testEndpointMutation = useMutation({
    mutationFn: (id: number) => apiRequest<{ status: string; endpoint: ApiEndpoint }>(`/notification-endpoints/${id}/test`, {
      method: "POST",
    }),
    onSuccess: (payload) => {
      setEndpointError(null);
      setEndpointMessage(t("notifications.testSuccess", { name: payload.endpoint.name }));
    },
  });

  const policyMutation = useMutation({
    mutationFn: async (payload: { domainId?: number; values: PolicyPayload }) => {
      const path = payload.domainId
        ? `/notification-policies/domains/${payload.domainId}`
        : "/notification-policies/default";
      return apiRequest(path, {
        method: "PUT",
        body: JSON.stringify(payload.values),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notification-policies"] });
    },
  });

  const endpoints = useMemo(() => endpointsQuery.data?.endpoints ?? [], [endpointsQuery.data]);
  const domains = useMemo(() => domainsQuery.data?.domains ?? [], [domainsQuery.data]);
  const policies = policiesQuery.data;
  const selectedDomain = domains.find((domain) => domain.id === selectedDomainId) ?? null;
  const overridePolicy = selectedDomainId && policies?.overrides[String(selectedDomainId)] ? policies.overrides[String(selectedDomainId)] : undefined;
  const enabledEndpointCount = endpoints.filter((endpoint) => endpoint.enabled).length;
  const overrideCount = Object.keys(policies?.overrides ?? {}).length;
  const defaultThresholds = policies?.default.threshold_days.length ? policies.default.threshold_days.join(", ") : t("common.none");
  const overrideThresholds = overridePolicy?.threshold_days.length ? overridePolicy.threshold_days.join(", ") : t("common.none");
  const testingEndpointId = testEndpointMutation.isPending ? testEndpointMutation.variables : null;

  const endpointTypeLabel = (endpoint: ApiEndpoint) => t(
    endpoint.type === "email"
      ? "endpointType.email"
      : endpoint.type === "telegram"
        ? "endpointType.telegram"
        : "endpointType.webhook"
  );

  const endpointPreview = (endpoint: ApiEndpoint) => {
    if (endpoint.type === "telegram") {
      return endpoint.config.chat_id ?? t("common.none");
    }
    const configValues = endpoint.type === "email"
      ? [endpoint.config.recipient_email]
      : endpoint.type === "webhook"
        ? [endpoint.config.url]
        : Object.values(endpoint.config ?? {});
    const values = configValues.filter(Boolean);
    return values[0] ?? t("common.none");
  };

  const endpointMeta = (endpoint: ApiEndpoint) => {
    if (endpoint.type === "telegram") {
      return endpoint.config.bot_token ? t("notifications.telegramBotReady") : t("common.none");
    }
    if (endpoint.type === "webhook") {
      return endpoint.config.auth_header_name ? endpoint.config.auth_header_name : t("common.none");
    }
    return t("notifications.emailDeliveryReady");
  };

  const runEndpointTest = async (endpoint: ApiEndpoint) => {
    try {
      setEndpointMessage(null);
      setEndpointError(null);
      await testEndpointMutation.mutateAsync(endpoint.id);
    } catch (reason) {
      setEndpointMessage(null);
      setEndpointError(getApiErrorMessage(reason, t("notifications.testError")));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("nav.notifications")}</CardTitle>
          <CardDescription>{t("notifications.endpointDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <OverviewTile label={t("notifications.endpointListTitle")} value={endpoints.length} />
            <OverviewTile label={t("common.enabled")} value={enabledEndpointCount} />
            <OverviewTile label={t("notifications.defaultPolicyTitle")} value={policies?.default.endpoint_ids.length ?? 0} />
            <OverviewTile label={t("notifications.overridePolicyTitle")} value={overrideCount} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)] 2xl:items-start">
        <Card className="self-start">
          <CardHeader>
            <CardTitle>{editingEndpoint ? t("notifications.editEndpointTitle") : t("notifications.addEndpointTitle")}</CardTitle>
            <CardDescription>{t("notifications.endpointDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <EndpointForm
              endpoint={editingEndpoint ?? undefined}
              submitLabel={editingEndpoint ? t("notifications.saveEndpoint") : t("notifications.addEndpoint")}
              onSubmit={async (values) => {
                try {
                  setEndpointMessage(null);
                  setEndpointError(null);
                  await saveEndpointMutation.mutateAsync({ id: editingEndpoint?.id, values });
                } catch (reason) {
                  setEndpointMessage(null);
                  setEndpointError(getApiErrorMessage(reason, t("notifications.endpointSaveError")));
                }
              }}
              onCancel={editingEndpoint ? () => { setEditingEndpoint(null); setEndpointMessage(null); setEndpointError(null); } : undefined}
            />
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>{t("notifications.endpointListTitle")}</CardTitle>
            <CardDescription>{t("notifications.endpointListDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {endpointMessage ? <div className="rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{endpointMessage}</div> : null}
            {endpointError ? <div className="rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-destructive">{endpointError}</div> : null}
            {endpoints.length === 0 ? (
              <div className="info-panel">
                <p className="text-sm text-muted-foreground">{t("notifications.noEndpoints")}</p>
              </div>
            ) : null}
            {endpoints.length > 0 ? (
              <div className="overflow-hidden rounded-[20px] border border-border">
                <div className="hidden grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_180px_auto] gap-4 border-b border-border bg-[#f7f4ea] px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground xl:grid">
                  <div>{t("common.name")}</div>
                  <div>{t("common.type")}</div>
                  <div>{t("notifications.destinationLabel")}</div>
                  <div>{t("common.lastChecked")}</div>
                  <div className="text-right">{t("common.actions")}</div>
                </div>
                <div className="divide-y divide-border/80">
                  {endpoints.map((endpoint) => (
                    <div key={endpoint.id} className="px-4 py-4">
                      <div className="space-y-3 xl:grid xl:grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_180px_auto] xl:items-center xl:gap-4 xl:space-y-0">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">{endpoint.name}</p>
                            <Badge variant={endpoint.enabled ? "success" : "warning"}>
                              {endpoint.enabled ? t("common.enabled") : t("admin.disabledBadge")}
                            </Badge>
                          </div>
                          <p className="truncate text-xs text-muted-foreground" title={endpointMeta(endpoint)}>
                            {endpointMeta(endpoint)}
                          </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:contents">
                          <div className="space-y-1">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground xl:hidden">
                              {t("common.type")}
                            </p>
                            <p className="text-sm font-medium text-foreground">{endpointTypeLabel(endpoint)}</p>
                          </div>

                          <div className="min-w-0 space-y-1 text-sm text-foreground">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground xl:hidden">
                              {t("notifications.destinationLabel")}
                            </p>
                            <span className="block truncate" title={endpointPreview(endpoint)}>
                              {endpointPreview(endpoint)}
                            </span>
                          </div>

                          <div className="space-y-1 text-sm text-muted-foreground">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground xl:hidden">
                              {t("common.lastChecked")}
                            </p>
                            <span className="block">
                              {formatDateTime(endpoint.updated_at)}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-start gap-2 pt-1 xl:justify-end xl:pt-0">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={Boolean(testingEndpointId)}
                            onClick={() => void runEndpointTest(endpoint)}
                          >
                            {testingEndpointId === endpoint.id ? t("notifications.testingAction") : t("notifications.testAction")}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setEditingEndpoint(endpoint)}>{t("common.edit")}</Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => void deleteEndpointMutation.mutateAsync(endpoint.id).catch((reason) => {
                              setEndpointMessage(null);
                              setEndpointError(getApiErrorMessage(reason, t("notifications.endpointDeleteError")));
                            })}
                          >
                            {t("common.delete")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <Card className="self-start">
          <CardHeader>
            <CardTitle>{t("notifications.defaultPolicyTitle")}</CardTitle>
            <CardDescription>{t("notifications.defaultPolicyDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="info-panel">
                <p className="section-heading">{t("notifications.thresholdsLabel")}</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{defaultThresholds}</p>
              </div>
              <div className="info-panel">
                <p className="section-heading">{t("notifications.channels")}</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{policies?.default.endpoint_ids.length ?? 0}</p>
              </div>
            </div>

            <PolicyForm
              endpoints={endpoints}
              policy={policies?.default}
              submitLabel={t("notifications.saveDefaultPolicy")}
              onSubmit={async (values) => {
                await policyMutation.mutateAsync({ values });
              }}
            />
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>{t("notifications.overridePolicyTitle")}</CardTitle>
            <CardDescription>{t("notifications.overridePolicyDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3">
              <div className="space-y-2">
                <p className="section-heading">{t("notifications.selectDomain")}</p>
                <select
                  className="form-select"
                  value={selectedDomainId ?? ""}
                  onChange={(event) => setSelectedDomainId(event.target.value ? Number(event.target.value) : null)}
                >
                  <option value="">{t("notifications.selectDomain")}</option>
                  {domains.map((domain) => (
                    <option key={domain.id} value={domain.id}>{domain.hostname}:{domain.port}</option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="info-panel">
                  <p className="section-heading">{t("notifications.thresholdsLabel")}</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">{selectedDomain ? overrideThresholds : t("common.none")}</p>
                </div>

                <div className="info-panel">
                  <p className="section-heading">{t("notifications.channels")}</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {selectedDomain ? (overridePolicy?.endpoint_ids.length ?? 0) : t("common.none")}
                  </p>
                </div>
              </div>
            </div>

            {selectedDomain ? (
              <PolicyForm
                endpoints={endpoints}
                policy={overridePolicy}
                submitLabel={t("notifications.saveDomainPolicy")}
                onSubmit={async (values) => {
                  await policyMutation.mutateAsync({ domainId: selectedDomain.id, values });
                }}
              />
            ) : (
              <div className="info-panel">
                <p className="text-sm text-muted-foreground">{t("notifications.chooseDomainToEdit")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
