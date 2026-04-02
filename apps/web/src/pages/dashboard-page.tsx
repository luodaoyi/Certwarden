import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { DomainForm, type DomainPayload } from "@/components/domains/domain-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/api";
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

export function DashboardPage() {
  const queryClient = useQueryClient();
  const [editingDomain, setEditingDomain] = useState<ApiDomain | null>(null);

  const domainsQuery = useQuery({
    queryKey: ["domains"],
    queryFn: () => apiRequest<{ domains: ApiDomain[] }>("/domains"),
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
      await queryClient.invalidateQueries({ queryKey: ["domains"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/domains/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["domains"] });
    },
  });

  const checkMutation = useMutation({
    mutationFn: (id: number) => apiRequest<{ domain: ApiDomain }>(`/domains/${id}/check`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["domains"] });
    },
  });

  const domains = useMemo(() => domainsQuery.data?.domains ?? [], [domainsQuery.data]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{editingDomain ? "Edit domain" : "Add domain"}</CardTitle>
          <CardDescription>Add TLS hostnames and set how often the worker pool should re-check certificates.</CardDescription>
        </CardHeader>
        <CardContent>
          <DomainForm
            domain={editingDomain ?? undefined}
            submitLabel={editingDomain ? "Save changes" : "Add domain"}
            onSubmit={async (values) => {
              await saveMutation.mutateAsync({ id: editingDomain?.id, values });
            }}
            onCancel={editingDomain ? () => setEditingDomain(null) : undefined}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Managed domains</CardTitle>
          <CardDescription>Monitor status, expiry, and manual scans for your tenant.</CardDescription>
        </CardHeader>
        <CardContent>
          {domainsQuery.isLoading ? <p>Loading domains…</p> : null}
          {domains.length === 0 ? <p className="text-sm text-muted-foreground">No domains added yet.</p> : null}
          {domains.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2">Hostname</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Days left</th>
                    <th className="px-3 py-2">Next check</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {domains.map((domain) => (
                    <tr key={domain.id} className="border-b border-border/70">
                      <td className="px-3 py-2">
                        <div className="font-medium">{domain.hostname}</div>
                        <div className="text-xs text-muted-foreground">Port {domain.port}</div>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={statusVariant(domain.status)}>{domain.status}</Badge>
                      </td>
                      <td className="px-3 py-2">{domain.days_remaining ?? "—"}</td>
                      <td className="px-3 py-2">{new Date(domain.next_check_at).toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => setEditingDomain(domain)}>Edit</Button>
                          <Button variant="secondary" size="sm" onClick={() => void checkMutation.mutateAsync(domain.id)}>Check now</Button>
                          <Button variant="destructive" size="sm" onClick={() => void deleteMutation.mutateAsync(domain.id)}>Delete</Button>
                        </div>
                        {domain.last_error ? <p className="mt-2 text-xs text-destructive">{domain.last_error}</p> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
