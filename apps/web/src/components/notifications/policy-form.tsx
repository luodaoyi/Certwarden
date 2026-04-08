import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import type { ApiEndpoint, PolicyView } from "@/lib/types";

interface PolicyFormValues {
  thresholds: string;
  endpoint_ids: number[];
}

export interface PolicyPayload {
  threshold_days: number[];
  endpoint_ids: number[];
}

export function PolicyForm({
  endpoints,
  policy,
  submitLabel,
  onSubmit,
}: {
  endpoints: ApiEndpoint[];
  policy?: PolicyView;
  submitLabel: string;
  onSubmit: (payload: PolicyPayload) => Promise<void>;
}) {
  const { t } = useI18n();
  const form = useForm<PolicyFormValues>({
    defaultValues: {
      thresholds: policy?.threshold_days.join(", ") ?? "30, 7, 1",
      endpoint_ids: policy?.endpoint_ids ?? [],
    },
  });

  useEffect(() => {
    form.reset({
      thresholds: policy?.threshold_days.join(", ") ?? "30, 7, 1",
      endpoint_ids: policy?.endpoint_ids ?? [],
    });
  }, [form, policy]);

  const thresholdPreview = form.watch("thresholds");

  const handleSubmit = form.handleSubmit(async (values) => {
    const threshold_days = values.thresholds
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item) && item >= 0);

    await onSubmit({
      threshold_days,
      endpoint_ids: values.endpoint_ids,
    });
  });

  const selectedEndpointIds = form.watch("endpoint_ids");

  return (
    <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
      <div className="space-y-2">
        <label className="text-sm font-medium">{t("notifications.thresholdsLabel")}</label>
        <Input placeholder={t("notifications.thresholdsPlaceholder")} {...form.register("thresholds")} />
        <p className="field-note">{t("notifications.currentThresholdInput", { value: thresholdPreview })}</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("notifications.channels")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {endpoints.map((endpoint) => (
            <label key={endpoint.id} className="compact-list-row flex min-h-14 items-center gap-3 py-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 border border-border accent-primary"
                checked={selectedEndpointIds.includes(endpoint.id)}
                onChange={(event) => {
                  const current = form.getValues("endpoint_ids");
                  if (event.target.checked) {
                    form.setValue("endpoint_ids", [...current, endpoint.id]);
                    return;
                  }
                  form.setValue(
                    "endpoint_ids",
                    current.filter((id) => id !== endpoint.id)
                  );
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{endpoint.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(endpoint.type === "email" ? "endpointType.email" : endpoint.type === "telegram" ? "endpointType.telegram" : "endpointType.webhook")}
                </p>
              </div>
              <Badge className="ml-auto" variant={endpoint.enabled ? "success" : "warning"}>
                {endpoint.enabled ? t("common.enabled") : t("admin.disabledBadge")}
              </Badge>
            </label>
          ))}
        </div>
      </div>

      <div className="action-row">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
