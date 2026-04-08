import { useEffect, useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";

interface PasswordFormValues {
  password: string;
}

function SummaryTile({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="metric-tile min-h-[96px]">
      <p className="section-heading">{label}</p>
      <p className="mt-3 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function AdminPage() {
  const { t, formatDateTime } = useI18n();
  const getApiErrorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [tenantQuery, setTenantQuery] = useState("");
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

  const tenants = useMemo(() => tenantsQuery.data?.tenants ?? [], [tenantsQuery.data?.tenants]);

  const filteredTenants = useMemo(() => {
    const normalizedQuery = tenantQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return tenants;
    }

    return tenants.filter((item) => {
      const haystack = [item.tenant.name, item.owner.username, item.owner.email, String(item.tenant.id)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [tenantQuery, tenants]);

  useEffect(() => {
    if (filteredTenants.length === 0) {
      return;
    }

    const selectedStillVisible = filteredTenants.some((item) => item.tenant.id === selectedTenantId);
    if (!selectedTenantId || !selectedStillVisible) {
      setSelectedTenantId(filteredTenants[0].tenant.id);
    }
  }, [filteredTenants, selectedTenantId]);

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

  const detail = detailQuery.data;
  const selectedTenantVisible = filteredTenants.some((item) => item.tenant.id === selectedTenantId);

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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <CardTitle>{t("admin.tenantsTitle")}</CardTitle>
              <CardDescription>{t("admin.tenantsDescription")}</CardDescription>
            </div>
            <div className="w-full max-w-sm space-y-2">
              <Label htmlFor="tenant-query">{t("admin.searchLabel")}</Label>
              <Input
                id="tenant-query"
                value={tenantQuery}
                onChange={(event) => setTenantQuery(event.target.value)}
                placeholder={t("admin.searchPlaceholder")}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {tenantsQuery.isLoading ? <p className="text-sm text-muted-foreground">{t("common.loadingSession")}</p> : null}
          {!tenantsQuery.isLoading && tenants.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.noTenants")}</p> : null}
          {!tenantsQuery.isLoading && tenants.length > 0 ? (
            <div className="overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_0_0_1px_rgba(240,238,230,0.8)]">
              <div className="max-h-[520px] overflow-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-[#f3f0e6]">
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 font-medium text-muted-foreground">{t("common.name")}</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">{t("common.username")}</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">{t("common.status")}</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">{t("admin.domainCountLabel")}</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">{t("admin.errorCountLabel")}</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">{t("statusPage.nextExpiry")}</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTenants.map((item) => {
                      const selected = selectedTenantId === item.tenant.id;
                      return (
                        <tr
                          key={item.tenant.id}
                          onClick={() => {
                            setSelectedTenantId(item.tenant.id);
                            setActionMessage(null);
                            setActionError(null);
                          }}
                          className={cn(
                            "cursor-pointer border-b border-border/80 transition last:border-b-0 hover:bg-secondary/40",
                            selected && "bg-secondary/60"
                          )}
                        >
                          <td className="px-4 py-3 align-top">
                            <button
                              type="button"
                              className="block min-w-0 text-left"
                              onClick={() => {
                                setSelectedTenantId(item.tenant.id);
                                setActionMessage(null);
                                setActionError(null);
                              }}
                            >
                              <span className="block truncate font-semibold text-foreground">{item.tenant.name}</span>
                              <span className="mt-1 block text-xs text-muted-foreground">ID #{item.tenant.id}</span>
                            </button>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="min-w-[140px]">
                              <p className="truncate font-medium text-foreground">{item.owner.username}</p>
                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                {item.owner.email || t("settings.noEmailBound")}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <Badge variant={item.tenant.disabled ? "warning" : "success"}>
                              {item.tenant.disabled ? t("admin.disabledBadge") : t("admin.activeBadge")}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 align-top font-semibold text-foreground">{item.stats.domain_count}</td>
                          <td className="px-4 py-3 align-top font-semibold text-foreground">{item.stats.error_count}</td>
                          <td className="px-4 py-3 align-top">
                            <span className="block min-w-[160px] text-sm text-foreground">
                              {formatDateTime(item.stats.next_expiry_at) || t("common.none")}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right align-top">
                            <Button
                              size="sm"
                              variant={selected ? "command" : "outline"}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedTenantId(item.tenant.id);
                                setActionMessage(null);
                                setActionError(null);
                              }}
                            >
                              {t("admin.manageTenant")}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredTenants.length === 0 ? (
                <div className="border-t border-border px-4 py-6 text-sm text-muted-foreground">{t("admin.noTenantMatches")}</div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-6">
        {detail && selectedTenantVisible ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{detail.tenant.name}</CardTitle>
                <CardDescription>{t("admin.tenantDetailDescription", { tenantId: detail.tenant.id })}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <SummaryTile label={t("admin.domainCountLabel")} value={detail.stats.domain_count} />
                  <SummaryTile label={t("admin.healthyCountLabel")} value={detail.stats.healthy_count} />
                  <SummaryTile label={t("admin.pendingCountLabel")} value={detail.stats.pending_count} />
                  <SummaryTile label={t("admin.errorCountLabel")} value={detail.stats.error_count} />
                </div>

                <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
                  <div className="info-panel">
                    <p className="section-heading">{t("common.status")}</p>
                    <div className="mt-3">
                      <Badge variant={detail.tenant.disabled ? "warning" : "success"}>
                        {detail.tenant.disabled ? t("admin.disabledBadge") : t("admin.activeBadge")}
                      </Badge>
                    </div>
                  </div>

                  <div className="info-panel">
                    <p className="section-heading">{t("common.username")}</p>
                    <p className="mt-3 truncate text-sm font-semibold text-foreground">{detail.owner.username}</p>
                  </div>

                  <div className="info-panel">
                    <p className="section-heading">{t("common.email")}</p>
                    <p className="mt-3 truncate text-sm text-foreground" title={detail.owner.email || t("settings.noEmailBound")}>
                      {detail.owner.email || t("settings.noEmailBound")}
                    </p>
                  </div>

                  <div className="info-panel lg:col-span-2 xl:col-span-3">
                    <p className="section-heading">{t("admin.publicStatusPage")}</p>
                    <a className="mt-3 block truncate text-sm font-medium text-primary" href={detail.stats.public_status_url} target="_blank" rel="noreferrer">
                      {detail.stats.public_status_url}
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_380px] xl:items-start">
              <Card className="self-start">
                <CardHeader>
                  <CardTitle>{t("admin.tenantAccessTitle")}</CardTitle>
                  <CardDescription>{t("admin.tenantAccessDescription")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-[190px_minmax(0,1fr)] md:items-start">
                    <div className="info-panel">
                      <p className="section-heading">{t("common.status")}</p>
                      <div className="mt-3">
                        <Badge variant={detail.tenant.disabled ? "warning" : "success"}>
                          {detail.tenant.disabled ? t("admin.disabledBadge") : t("admin.activeBadge")}
                        </Badge>
                      </div>
                    </div>
                    <div className="info-panel">
                      <p className="section-heading">{t("common.username")}</p>
                      <p className="mt-3 text-sm font-semibold text-foreground">{detail.owner.username}</p>
                    </div>
                  </div>

                  <div className="action-row">
                    <Button
                      className="w-full sm:w-auto"
                      variant={detail.tenant.disabled ? "command" : "outline"}
                      onClick={() => void statusMutation.mutateAsync(!detail.tenant.disabled).catch((reason) => {
                        setActionMessage(null);
                        setActionError(getApiErrorMessage(reason, t("admin.tenantStatusError")));
                      })}
                    >
                      {detail.tenant.disabled ? t("admin.enableTenant") : t("admin.disableTenant")}
                    </Button>
                    <Button
                      className="w-full sm:w-auto"
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

              <Card className="self-start">
                <CardHeader>
                  <CardTitle>{t("admin.resetPasswordTitle")}</CardTitle>
                  <CardDescription>{t("admin.resetPasswordDescription")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <form className="space-y-4" onSubmit={(event) => void handlePasswordSubmit(event)}>
                    <div className="space-y-2">
                      <Label htmlFor="tenant-password">{t("common.newPassword")}</Label>
                      <Input
                        id="tenant-password"
                        type="password"
                        error={passwordForm.formState.errors.password?.message}
                        {...passwordForm.register("password", { required: true, minLength: 8 })}
                      />
                    </div>
                    <div className="action-row sm:justify-end">
                      <Button className="w-full sm:w-fit" type="submit">{t("admin.updateTenantPassword")}</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">
                {filteredTenants.length === 0 && tenants.length > 0 ? t("admin.noTenantMatches") : t("admin.selectTenantPrompt")}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
