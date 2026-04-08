import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { EndpointForm, type EndpointPayload } from "@/components/notifications/endpoint-form";
import { PolicyForm, type PolicyPayload } from "@/components/notifications/policy-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { ApiDomain, ApiEndpoint, TenantPolicies } from "@/lib/types";

export function NotificationsPage() {
  const { t } = useI18n();
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

  return (
    <div className="space-y-6">
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
            <div key={endpoint.id} className="compact-list-row flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{endpoint.name}</p>
                  <Badge variant={endpoint.enabled ? "success" : "warning"}>
                    {endpoint.enabled ? t("common.enabled") : t("admin.disabledBadge")}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(endpoint.type === "email" ? "endpointType.email" : endpoint.type === "telegram" ? "endpointType.telegram" : "endpointType.webhook")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingEndpoint(endpoint)}>{t("common.edit")}</Button>
                <Button variant="destructive" size="sm" onClick={() => void deleteEndpointMutation.mutateAsync(endpoint.id)}>{t("common.delete")}</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("notifications.defaultPolicyTitle")}</CardTitle>
          <CardDescription>{t("notifications.defaultPolicyDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
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
        <CardContent className="space-y-4">
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
            <p className="text-sm text-muted-foreground">{t("notifications.chooseDomainToEdit")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
