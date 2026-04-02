import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { DomainForm, type DomainPayload } from "@/components/domains/domain-form";
import { EndpointForm, type EndpointPayload } from "@/components/notifications/endpoint-form";
import { PolicyForm, type PolicyPayload } from "@/components/notifications/policy-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/api";
import type { AdminUserDetail, AdminUserListItem, ApiDomain, ApiEndpoint } from "@/lib/types";

export function AdminPage() {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [editingDomain, setEditingDomain] = useState<ApiDomain | null>(null);
  const [editingEndpoint, setEditingEndpoint] = useState<ApiEndpoint | null>(null);
  const [selectedPolicyDomainId, setSelectedPolicyDomainId] = useState<number | null>(null);

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => apiRequest<{ users: AdminUserListItem[] }>("/admin/users"),
  });

  useEffect(() => {
    if (!selectedUserId && usersQuery.data?.users.length) {
      setSelectedUserId(usersQuery.data.users[0].user.id);
    }
  }, [selectedUserId, usersQuery.data?.users]);

  const detailQuery = useQuery({
    queryKey: ["admin-user-detail", selectedUserId],
    enabled: Boolean(selectedUserId),
    queryFn: () => apiRequest<AdminUserDetail>(`/admin/users/${selectedUserId}`),
  });

  const settingsQuery = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => apiRequest<{ allow_registration: boolean }>("/admin/settings"),
  });

  const registrationMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("/admin/settings/registration", {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
    },
  });

  const domainMutation = useMutation({
    mutationFn: async (payload: { id?: number; values: DomainPayload }) => {
      if (!selectedUserId) throw new Error("No selected user");
      const base = `/admin/users/${selectedUserId}/domains`;
      if (payload.id) {
        return apiRequest(`${base}/${payload.id}`, {
          method: "PUT",
          body: JSON.stringify(payload.values),
        });
      }
      return apiRequest(base, {
        method: "POST",
        body: JSON.stringify(payload.values),
      });
    },
    onSuccess: async () => {
      setEditingDomain(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-user-detail", selectedUserId] });
    },
  });

  const endpointMutation = useMutation({
    mutationFn: async (payload: { id?: number; values: EndpointPayload }) => {
      if (!selectedUserId) throw new Error("No selected user");
      const base = `/admin/users/${selectedUserId}/notification-endpoints`;
      if (payload.id) {
        return apiRequest(`${base}/${payload.id}`, {
          method: "PUT",
          body: JSON.stringify(payload.values),
        });
      }
      return apiRequest(base, {
        method: "POST",
        body: JSON.stringify(payload.values),
      });
    },
    onSuccess: async () => {
      setEditingEndpoint(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-user-detail", selectedUserId] });
    },
  });

  const deleteDomainMutation = useMutation({
    mutationFn: async (id: number) => {
      if (!selectedUserId) throw new Error("No selected user");
      return apiRequest(`/admin/users/${selectedUserId}/domains/${id}`, { method: "DELETE" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-user-detail", selectedUserId] });
    },
  });

  const deleteEndpointMutation = useMutation({
    mutationFn: async (id: number) => {
      if (!selectedUserId) throw new Error("No selected user");
      return apiRequest(`/admin/users/${selectedUserId}/notification-endpoints/${id}`, { method: "DELETE" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-user-detail", selectedUserId] });
    },
  });

  const manualCheckMutation = useMutation({
    mutationFn: async (id: number) => {
      if (!selectedUserId) throw new Error("No selected user");
      return apiRequest(`/admin/users/${selectedUserId}/domains/${id}/check`, { method: "POST" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-user-detail", selectedUserId] });
    },
  });

  const policyMutation = useMutation({
    mutationFn: async (payload: { domainId?: number; values: PolicyPayload }) => {
      if (!selectedUserId) throw new Error("No selected user");
      const path = payload.domainId
        ? `/admin/users/${selectedUserId}/notification-policies/domains/${payload.domainId}`
        : `/admin/users/${selectedUserId}/notification-policies/default`;
      return apiRequest(path, {
        method: "PUT",
        body: JSON.stringify(payload.values),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-user-detail", selectedUserId] });
    },
  });

  const users = usersQuery.data?.users ?? [];
  const detail = detailQuery.data;
  const selectedOverridePolicy = selectedPolicyDomainId && detail?.policies.overrides[String(selectedPolicyDomainId)]
    ? detail.policies.overrides[String(selectedPolicyDomainId)]
    : undefined;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Platform settings</CardTitle>
          <CardDescription>Control self-service registration and manage tenant workspaces.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium">Registration</p>
            <p className="text-sm text-muted-foreground">
              {settingsQuery.data?.allow_registration ? "New users can create accounts." : "Registration is currently disabled."}
            </p>
          </div>
          <Button onClick={() => void registrationMutation.mutateAsync(!settingsQuery.data?.allow_registration)}>
            {settingsQuery.data?.allow_registration ? "Disable registration" : "Enable registration"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Tenants</CardTitle>
            <CardDescription>Select a user to manage domains and notifications.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {users.map((item) => (
              <button
                key={item.user.id}
                className={`w-full rounded-lg border px-3 py-3 text-left ${selectedUserId === item.user.id ? "border-primary bg-accent" : "border-border"}`}
                onClick={() => setSelectedUserId(item.user.id)}
              >
                <p className="font-medium">{item.user.email}</p>
                <p className="text-sm text-muted-foreground">{item.tenant.name}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {detail ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Selected workspace</CardTitle>
                  <CardDescription>{detail.user.email} · {detail.tenant.name}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <Badge variant={detail.user.role === "super_admin" ? "warning" : "muted"}>{detail.user.role}</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{editingDomain ? "Edit domain" : "Create domain for tenant"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <DomainForm
                    domain={editingDomain ?? undefined}
                    submitLabel={editingDomain ? "Save domain" : "Add domain"}
                    onSubmit={async (values) => {
                      await domainMutation.mutateAsync({ id: editingDomain?.id, values });
                    }}
                    onCancel={editingDomain ? () => setEditingDomain(null) : undefined}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Tenant domains</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {detail.domains.map((domain) => (
                    <div key={domain.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
                      <div>
                        <p className="font-medium">{domain.hostname}:{domain.port}</p>
                        <p className="text-sm text-muted-foreground">Status: {domain.status} · Days: {domain.days_remaining ?? "—"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditingDomain(domain)}>Edit</Button>
                        <Button variant="secondary" size="sm" onClick={() => void manualCheckMutation.mutateAsync(domain.id)}>Check now</Button>
                        <Button variant="destructive" size="sm" onClick={() => void deleteDomainMutation.mutateAsync(domain.id)}>Delete</Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{editingEndpoint ? "Edit endpoint" : "Create endpoint"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <EndpointForm
                    endpoint={editingEndpoint ?? undefined}
                    submitLabel={editingEndpoint ? "Save endpoint" : "Add endpoint"}
                    onSubmit={async (values) => {
                      await endpointMutation.mutateAsync({ id: editingEndpoint?.id, values });
                    }}
                    onCancel={editingEndpoint ? () => setEditingEndpoint(null) : undefined}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Tenant endpoints</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {detail.endpoints.map((endpoint) => (
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
                  <CardTitle>Tenant policies</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <PolicyForm
                    endpoints={detail.endpoints}
                    policy={detail.policies.default}
                    submitLabel="Save default policy"
                    onSubmit={async (values) => {
                      await policyMutation.mutateAsync({ values });
                    }}
                  />
                  <div className="space-y-4 border-t border-border pt-4">
                    <select
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                      value={selectedPolicyDomainId ?? ""}
                      onChange={(event) => setSelectedPolicyDomainId(event.target.value ? Number(event.target.value) : null)}
                    >
                      <option value="">Select a domain override</option>
                      {detail.domains.map((domain) => (
                        <option key={domain.id} value={domain.id}>{domain.hostname}:{domain.port}</option>
                      ))}
                    </select>
                    {selectedPolicyDomainId ? (
                      <PolicyForm
                        endpoints={detail.endpoints}
                        policy={selectedOverridePolicy}
                        submitLabel="Save override policy"
                        onSubmit={async (values) => {
                          await policyMutation.mutateAsync({ domainId: selectedPolicyDomainId, values });
                        }}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">Select a domain above to manage its override policy.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">Select a tenant to manage their domains and notifications.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
