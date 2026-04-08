import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { resolvePublicStatusSubtitle, resolvePublicStatusTitle } from "@/lib/public-status";
import type { PublicTenantStatus } from "@/lib/types";

interface SettingsFormValues {
  username: string;
  email: string;
  public_status_title: string;
  public_status_subtitle: string;
}

export function SettingsPage() {
  const { user, updateProfile } = useAuth();
  const { t } = useI18n();
  const getApiErrorMessage = useApiErrorMessage();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const publicStatusQuery = useQuery({
    queryKey: ["workspace-public-status-settings", user?.tenant_id],
    enabled: Boolean(user?.tenant_id),
    queryFn: () => apiRequest<PublicTenantStatus>(`/public/tenants/${user?.tenant_id}/status`, undefined, false),
  });

  const form = useForm<SettingsFormValues>({
    defaultValues: {
      username: user?.username ?? "",
      email: user?.email ?? "",
      public_status_title: "",
      public_status_subtitle: "",
    },
  });

  useEffect(() => {
    form.reset({
      username: user?.username ?? "",
      email: user?.email ?? "",
      public_status_title: publicStatusQuery.data?.tenant.public_status_title ?? "",
      public_status_subtitle: publicStatusQuery.data?.tenant.public_status_subtitle ?? "",
    });
  }, [
    form,
    publicStatusQuery.data?.tenant.public_status_subtitle,
    publicStatusQuery.data?.tenant.public_status_title,
    user?.email,
    user?.username,
  ]);

  const watchedTitle = form.watch("public_status_title");
  const watchedSubtitle = form.watch("public_status_subtitle");
  const effectiveTitle = resolvePublicStatusTitle(publicStatusQuery.data?.tenant ? {
    name: publicStatusQuery.data.tenant.name,
    public_status_title: watchedTitle,
  } : undefined, t("statusPage.titleFallback"));
  const effectiveSubtitle = resolvePublicStatusSubtitle({
    public_status_subtitle: watchedSubtitle,
  }, t("statusPage.subtitleFallback"));

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      setError(null);
      setMessage(null);
      await updateProfile(values);
      await publicStatusQuery.refetch();
      setMessage(t("settings.saveSuccess"));
    } catch (reason) {
      setError(getApiErrorMessage(reason, t("settings.saveError")));
    }
  });

  return (
    <form className="space-y-6" onSubmit={(event) => void handleSubmit(event)}>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.title")}</CardTitle>
          <CardDescription>{t("settings.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 md:max-w-3xl md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="settings-username">{t("common.username")}</Label>
              <Input id="settings-username" {...form.register("username", { required: true })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-email">{t("common.email")}</Label>
              <Input id="settings-email" type="email" placeholder={t("settings.optionalEmailPlaceholder")} {...form.register("email")} />
              <p className="field-note">{t("settings.emailHint")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.publicPageTitle")}</CardTitle>
          <CardDescription>{t("settings.publicPageDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
            <div className="grid gap-5">
              <div className="space-y-2">
                <Label htmlFor="settings-public-title">{t("settings.publicPageTitleLabel")}</Label>
                <Input id="settings-public-title" placeholder={t("settings.publicPageTitlePlaceholder")} {...form.register("public_status_title")} />
                <p className="field-note">{t("settings.publicPageTitleHint")}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="settings-public-subtitle">{t("settings.publicPageSubtitleLabel")}</Label>
                <Input id="settings-public-subtitle" placeholder={t("settings.publicPageSubtitlePlaceholder")} {...form.register("public_status_subtitle")} />
                <p className="field-note">{t("settings.publicPageSubtitleHint")}</p>
              </div>

              <div className="info-panel">
                <p className="section-heading">{t("settings.publicPageUrlLabel")}</p>
                <a className="mt-2 block truncate text-sm font-medium text-primary" href={publicStatusQuery.data?.public_url ?? "#"} target="_blank" rel="noreferrer">
                  {publicStatusQuery.data?.public_url ?? t("common.none")}
                </a>
              </div>
            </div>

            <div className="info-panel self-start">
              <p className="section-heading">{t("settings.publicPagePreview")}</p>
              <div className="mt-4 space-y-3">
                <p className="font-[Georgia,'Times_New_Roman',serif] text-[24px] font-medium leading-[1.2] text-foreground">{effectiveTitle}</p>
                <p className="text-sm leading-6 text-muted-foreground">{effectiveSubtitle}</p>
                <div className="action-row">
                  <a
                    className="inline-flex h-10 items-center justify-center rounded-[12px] border border-border bg-[#fffdf8] px-4 text-[14px] font-medium text-foreground shadow-[0_0_0_1px_rgba(240,238,230,0.8)] transition hover:bg-[#f3f0e6]"
                    href={publicStatusQuery.data?.public_url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("settings.openPublicPage")}
                  </a>
                </div>
              </div>
            </div>
          </div>

          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="action-row">
            <Button className="w-fit" type="submit">{t("common.save")}</Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
