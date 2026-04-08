import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error";
import { useI18n } from "@/lib/i18n";
import type { AdminTenantDetail, AdminTenantListItem } from "@/lib/types";

interface PasswordFormValues {
  password: string;
}

export function AdminPage() {
  const { t } = useI18n();
  const getApiErrorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const passwordForm = useForm<PasswordFormValues>({
    defaultValues: {
      password: "",
    },
  });

  const tenantsQuery = useQuery({
    queryKey: ["admin-tenants"],
    queryFn: () => apiRequest<{ tenants: AdminTenantListItem[] }>("/admin/tenants"),
  });

  useEffect(() => {
    if (!selectedTenantId && tenantsQuery.data?.tenants.length) {
      setSelectedTenantId(tenantsQuery.data.tenants[0].tenant.id);
    }
  }, [selectedTenantId, tenantsQuery.data?.tenants]);

  const detailQuery = useQuery({
    queryKey: ["admin-tenant", selectedTenantId],
    enabled: Boolean(selectedTenantId),
    queryFn: () => apiRequest<AdminTenantDetail>(`/admin/tenants/${selectedTenantId}`),
  });

  const statusMutation = useMutation({
    mutationFn: async (disabled: boolean) => {
      if (!selectedTenantId) throw new Error("tenant not found");
      return apiRequest<{ tenant: AdminTenantDetail["tenant"] }>(`/admin/tenants/${selectedTenantId}/status`, {
        method: "PUT",
        body: JSON.stringify({ disabled }),
      });
    },
    onSuccess: async (_, disabled) => {
      setActionError(null);
      setActionMessage(disabled ? t("admin.tenantDisabledSuccess") : t("admin.tenantEnabledSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-tenant", selectedTenantId] });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async (password: string) => {
      if (!selectedTenantId) throw new Error("tenant not found");
      return apiRequest(`/admin/tenants/${selectedTenantId}/password`, {
        method: "PUT",
        body: JSON.stringify({ password }),
      });
    },
    onSuccess: () => {
      setActionError(null);
      setActionMessage(t("admin.passwordUpdatedSuccess"));
      passwordForm.reset({ password: "" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTenantId) throw new Error("tenant not found");
      return apiRequest(`/admin/tenants/${selectedTenantId}`, { method: "DELETE" });
    },
    onSuccess: async () => {
      const remaining = (tenantsQuery.data?.tenants ?? []).filter((item) => item.tenant.id !== selectedTenantId);
      setSelectedTenantId(remaining[0]?.tenant.id ?? null);
      setActionError(null);
      setActionMessage(t("admin.tenantDeletedSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-tenant", selectedTenantId] });
    },
  });

  const tenants = tenantsQuery.data?.tenants ?? [];
  const detail = detailQuery.data;

  const handlePasswordSubmit = passwordForm.handleSubmit(async (values) => {
    try {
      setActionMessage(null);
      setActionError(null);
      await passwordMutation.mutateAsync(values.password);
    } catch (reason) {
      setActionMessage(null);
      setActionError(getApiErrorMessage(reason, t("admin.passwordUpdateError")));
    }
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.tenantsTitle")}</CardTitle>
          <CardDescription>{t("admin.tenantsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tenants.map((item) => (
            <button
              key={item.tenant.id}
              type="button"
              className={`w-full border px-4 py-4 text-left transition ${selectedTenantId === item.tenant.id ? "border-primary bg-secondary text-foreground shadow-[inset_3px_0_0_0_var(--color-primary)]" : "border-border bg-background text-foreground hover:bg-secondary/70"}`}
              onClick={() => {
                setSelectedTenantId(item.tenant.id);
                setActionMessage(null);
                setActionError(null);
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm font-semibold">{item.tenant.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.owner.username}</p>
                </div>
                <Badge className="self-start" variant={item.tenant.disabled ? "warning" : "success"}>
                  {item.tenant.disabled ? t("admin.disabledBadge") : t("admin.activeBadge")}
                </Badge>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">{t("admin.domainCountLabel")}</dt>
                  <dd className="font-semibold text-foreground">{item.stats.domain_count}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">{t("admin.errorCountLabel")}</dt>
                  <dd className="font-semibold text-foreground">{item.stats.error_count}</dd>
                </div>
              </dl>
            </button>
          ))}
          {tenants.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.noTenants")}</p> : null}
        </CardContent>
      </Card>

      <div className="space-y-6">
        {detail ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{detail.tenant.name}</CardTitle>
                <CardDescription>{t("admin.tenantDetailDescription", { tenantId: detail.tenant.id })}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 lg:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="border border-border bg-background px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("common.status")}</p>
                    <div className="mt-2">
                      <Badge variant={detail.tenant.disabled ? "warning" : "success"}>
                        {detail.tenant.disabled ? t("admin.disabledBadge") : t("admin.activeBadge")}
                      </Badge>
                    </div>
                  </div>
                  <div className="border border-border bg-background px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("common.username")}</p>
                    <p className="mt-2 truncate text-sm font-semibold text-foreground">{detail.owner.username}</p>
                  </div>
                  <div className="border border-border bg-background px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("common.email")}</p>
                    <p className="mt-2 truncate text-sm text-foreground" title={detail.owner.email || t("settings.noEmailBound")}>
                      {detail.owner.email || t("settings.noEmailBound")}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="border border-border bg-background px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("admin.domainCountLabel")}</p>
                    <p className="mt-2 text-lg font-semibold">{detail.stats.domain_count}</p>
                  </div>
                  <div className="border border-border bg-background px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("admin.healthyCountLabel")}</p>
                    <p className="mt-2 text-lg font-semibold">{detail.stats.healthy_count}</p>
                  </div>
                  <div className="border border-border bg-background px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("admin.pendingCountLabel")}</p>
                    <p className="mt-2 text-lg font-semibold">{detail.stats.pending_count}</p>
                  </div>
                  <div className="border border-border bg-background px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("admin.errorCountLabel")}</p>
                    <p className="mt-2 text-lg font-semibold">{detail.stats.error_count}</p>
                  </div>
                </div>

                <div className="border border-border bg-background px-4 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("admin.publicStatusPage")}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <a className="truncate text-sm font-medium" href={detail.stats.public_status_url} target="_blank" rel="noreferrer">
                      {detail.stats.public_status_url}
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("admin.tenantAccessTitle")}</CardTitle>
                <CardDescription>{t("admin.tenantAccessDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant={detail.tenant.disabled ? "command" : "outline"}
                    onClick={() => void statusMutation.mutateAsync(!detail.tenant.disabled).catch((reason) => {
                      setActionMessage(null);
                      setActionError(getApiErrorMessage(reason, t("admin.tenantStatusError")));
                    })}
                  >
                    {detail.tenant.disabled ? t("admin.enableTenant") : t("admin.disableTenant")}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => void deleteMutation.mutateAsync().catch((reason) => {
                      setActionMessage(null);
                      setActionError(getApiErrorMessage(reason, t("admin.tenantDeleteError")));
                    })}
                  >
                    {t("admin.deleteTenant")}
                  </Button>
                </div>
                {actionMessage ? <p className="text-sm text-emerald-700">{actionMessage}</p> : null}
                {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("admin.resetPasswordTitle")}</CardTitle>
                <CardDescription>{t("admin.resetPasswordDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 md:max-w-md" onSubmit={(event) => void handlePasswordSubmit(event)}>
                  <div className="space-y-2">
                    <Label htmlFor="tenant-password">{t("common.newPassword")}</Label>
                    <Input
                      id="tenant-password"
                      type="password"
                      error={passwordForm.formState.errors.password?.message}
                      {...passwordForm.register("password", { required: true, minLength: 8 })}
                    />
                  </div>
                  <Button className="w-fit" type="submit">{t("admin.updateTenantPassword")}</Button>
                </form>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">{t("admin.selectTenantPrompt")}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
