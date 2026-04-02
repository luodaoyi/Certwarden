import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { EndpointForm, type EndpointPayload } from "@/components/notifications/endpoint-form";
import { PolicyForm, type PolicyPayload } from "@/components/notifications/policy-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/api";
import type { ApiDomain, ApiEndpoint, TenantPolicies } from "@/lib/types";

export function NotificationsPage() {
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
          <CardTitle>{editingEndpoint ? "Edit notification endpoint" : "Add notification endpoint"}</CardTitle>
          <CardDescription>Manage email recipients, Telegram chat IDs, and generic webhooks.</CardDescription>
        </CardHeader>
        <CardContent>
          <EndpointForm
            endpoint={editingEndpoint ?? undefined}
            submitLabel={editingEndpoint ? "Save endpoint" : "Add endpoint"}
            onSubmit={async (values) => {
              await saveEndpointMutation.mutateAsync({ id: editingEndpoint?.id, values });
            }}
            onCancel={editingEndpoint ? () => setEditingEndpoint(null) : undefined}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notification endpoints</CardTitle>
          <CardDescription>Bind these endpoints to default or per-domain threshold policies.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {endpoints.length === 0 ? <p className="text-sm text-muted-foreground">No endpoints configured yet.</p> : null}
          {endpoints.map((endpoint) => (
            <div key={endpoint.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
              <div>
                <p className="font-medium">{endpoint.name}</p>
                <p className="text-sm text-muted-foreground">{endpoint.type}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingEndpoint(endpoint)}>Edit</Button>
                <Button variant="destructive" size="sm" onClick={() => void deleteEndpointMutation.mutateAsync(endpoint.id)}>Delete</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Default tenant policy</CardTitle>
          <CardDescription>Applied to all domains unless a domain override exists.</CardDescription>
        </CardHeader>
        <CardContent>
          <PolicyForm
            endpoints={endpoints}
            policy={policies?.default}
            submitLabel="Save default policy"
            onSubmit={async (values) => {
              await policyMutation.mutateAsync({ values });
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Domain override policy</CardTitle>
          <CardDescription>Override thresholds and endpoint bindings for a single domain.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <select
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            value={selectedDomainId ?? ""}
            onChange={(event) => setSelectedDomainId(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">Select a domain</option>
            {domains.map((domain) => (
              <option key={domain.id} value={domain.id}>{domain.hostname}:{domain.port}</option>
            ))}
          </select>

          {selectedDomain ? (
            <PolicyForm
              endpoints={endpoints}
              policy={overridePolicy}
              submitLabel="Save domain policy"
              onSubmit={async (values) => {
                await policyMutation.mutateAsync({ domainId: selectedDomain.id, values });
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Choose a domain to edit its override policy.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
