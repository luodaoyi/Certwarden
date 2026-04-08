import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { EndpointForm, type EndpointPayload } from "@/components/notifications/endpoint-form";
import { PolicyForm, type PolicyPayload } from "@/components/notifications/policy-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/api";
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
  const queryClient = useQueryClient();
  const [editingEndpoint, setEditingEndpoint] = useState<ApiEndpoint | null>(null);
  const [selectedDomainId, setSelectedDomainId] = useState<number | null>(null);

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
      setEditingEndpoint(null);
      await queryClient.invalidateQueries({ queryKey: ["notification-endpoints"] });
    },
  });

  const deleteEndpointMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/notification-endpoints/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notification-endpoints"] });
      await queryClient.invalidateQueries({ queryKey: ["notification-policies"] });
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

  const endpointTypeLabel = (endpoint: ApiEndpoint) => t(
    endpoint.type === "email"
      ? "endpointType.email"
      : endpoint.type === "telegram"
        ? "endpointType.telegram"
        : "endpointType.webhook"
  );

  const endpointPreview = (endpoint: ApiEndpoint) => {
    const configValues = Object.values(endpoint.config_masked ?? {}).filter(Boolean);
    return configValues[0] ?? t("common.none");
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

      <div className="grid gap-6 2xl:grid-cols-[400px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{editingEndpoint ? t("notifications.editEndpointTitle") : t("notifications.addEndpointTitle")}</CardTitle>
            <CardDescription>{t("notifications.endpointDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <EndpointForm
              endpoint={editingEndpoint ?? undefined}
              submitLabel={editingEndpoint ? t("notifications.saveEndpoint") : t("notifications.addEndpoint")}
              onSubmit={async (values) => {
                await saveEndpointMutation.mutateAsync({ id: editingEndpoint?.id, values });
              }}
              onCancel={editingEndpoint ? () => setEditingEndpoint(null) : undefined}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("notifications.endpointListTitle")}</CardTitle>
            <CardDescription>{t("notifications.endpointListDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {endpoints.length === 0 ? <p className="text-sm text-muted-foreground">{t("notifications.noEndpoints")}</p> : null}
            {endpoints.map((endpoint) => (
              <div key={endpoint.id} className="compact-list-row">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">{endpoint.name}</p>
                      <Badge variant={endpoint.enabled ? "success" : "warning"}>
                        {endpoint.enabled ? t("common.enabled") : t("admin.disabledBadge")}
                      </Badge>
                      <Badge variant="muted">{endpointTypeLabel(endpoint)}</Badge>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_180px_180px]">
                      <div className="min-w-0">
                        <p className="section-heading">{t("common.name")}</p>
                        <p className="mt-2 truncate text-sm text-foreground" title={endpointPreview(endpoint)}>
                          {endpointPreview(endpoint)}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="section-heading">{t("common.type")}</p>
                        <p className="mt-2 text-sm font-medium text-foreground">{endpointTypeLabel(endpoint)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="section-heading">{t("common.lastChecked")}</p>
                        <p className="mt-2 text-sm text-foreground">{formatDateTime(endpoint.updated_at)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditingEndpoint(endpoint)}>{t("common.edit")}</Button>
                    <Button variant="destructive" size="sm" onClick={() => void deleteEndpointMutation.mutateAsync(endpoint.id)}>{t("common.delete")}</Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 2xl:grid-cols-2">
        <Card>
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

        <Card>
          <CardHeader>
            <CardTitle>{t("notifications.overridePolicyTitle")}</CardTitle>
            <CardDescription>{t("notifications.overridePolicyDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_180px_180px]">
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
