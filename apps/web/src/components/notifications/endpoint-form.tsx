import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import type { ApiEndpoint, EndpointType } from "@/lib/types";

interface EndpointFormValues {
  name: string;
  type: EndpointType;
  enabled: boolean;
  recipient_email: string;
  chat_id: string;
  url: string;
  auth_header_name: string;
  auth_header_value: string;
}

export interface EndpointPayload {
  name: string;
  type: EndpointType;
  enabled: boolean;
  config: Record<string, string>;
}

function endpointDefaults(endpoint?: ApiEndpoint): EndpointFormValues {
  const config = endpoint?.config_masked ?? {};
  return {
    name: endpoint?.name ?? "",
    type: endpoint?.type ?? "email",
    enabled: endpoint?.enabled ?? true,
    recipient_email: "",
    chat_id: "",
    url: "",
    auth_header_name: config.auth_header_name ?? "",
    auth_header_value: "",
  };
}

export function EndpointForm({
  endpoint,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  endpoint?: ApiEndpoint;
  submitLabel: string;
  onSubmit: (payload: EndpointPayload) => Promise<void>;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const form = useForm<EndpointFormValues>({
    defaultValues: endpointDefaults(endpoint),
  });

  useEffect(() => {
    form.reset(endpointDefaults(endpoint));
  }, [endpoint, form]);

  const values = form.watch();
  const endpointType = values.type;

  const primaryConfig = useMemo(() => {
    switch (endpointType) {
      case "email":
        return {
          label: t("notifications.recipientEmailLabel"),
          placeholder: t("notifications.primaryEmailPlaceholder"),
        };
      case "telegram":
        return {
          label: t("notifications.telegramChatIdLabel"),
          placeholder: t("notifications.telegramChatPlaceholder"),
        };
      case "webhook":
        return {
          label: t("notifications.webhookUrlLabel"),
          placeholder: t("notifications.webhookUrlPlaceholder"),
        };
      default:
        return {
          label: t("common.type"),
          placeholder: "",
        };
    }
  }, [endpointType, t]);

  const handleSubmit = form.handleSubmit(async (values) => {
    const config: Record<string, string> = {};
    if (values.type === "email") {
      config.recipient_email = values.recipient_email;
    }
    if (values.type === "telegram") {
      config.chat_id = values.chat_id;
    }
    if (values.type === "webhook") {
      config.url = values.url;
      if (values.auth_header_name) {
        config.auth_header_name = values.auth_header_name;
        config.auth_header_value = values.auth_header_value;
      }
    }
    await onSubmit({
      name: values.name,
      type: values.type,
      enabled: values.enabled,
      config,
    });
    if (!endpoint) {
      form.reset(endpointDefaults());
    }
  });

  const validationError = (() => {
    if (!values.name.trim()) return t("validation.nameRequired");
    if (values.type === "email" && !values.recipient_email.trim()) return t("validation.recipientEmailRequired");
    if (values.type === "telegram" && !values.chat_id.trim()) return t("validation.telegramChatIdRequired");
    if (values.type === "webhook" && !values.url.trim()) return t("validation.webhookUrlRequired");
    return null;
  })();

  return (
    <form className="grid gap-5 md:grid-cols-2" onSubmit={(event) => void handleSubmit(event)}>
      <div className="space-y-2">
        <Label htmlFor="endpoint-name">{t("common.name")}</Label>
        <Input id="endpoint-name" placeholder={t("notifications.addEndpointTitle")} {...form.register("name")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="endpoint-type">{t("common.type")}</Label>
        <select
          id="endpoint-type"
          className="form-select"
          {...form.register("type")}
        >
          <option value="email">{t("endpointType.email")}</option>
          <option value="telegram">{t("endpointType.telegram")}</option>
          <option value="webhook">{t("endpointType.webhook")}</option>
        </select>
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="endpoint-primary">{primaryConfig.label}</Label>
        {endpointType === "email" ? (
          <Input id="endpoint-primary" placeholder={primaryConfig.placeholder} {...form.register("recipient_email")} />
        ) : null}
        {endpointType === "telegram" ? (
          <Input id="endpoint-primary" placeholder={primaryConfig.placeholder} {...form.register("chat_id")} />
        ) : null}
        {endpointType === "webhook" ? (
          <Input id="endpoint-primary" placeholder={primaryConfig.placeholder} {...form.register("url")} />
        ) : null}
      </div>

      {endpointType === "webhook" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="auth-header-name">{t("notifications.authHeaderName")}</Label>
            <Input
              id="auth-header-name"
              placeholder={t("notifications.authHeaderNamePlaceholder")}
              {...form.register("auth_header_name")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="auth-header-value">{t("notifications.authHeaderValue")}</Label>
            <Input
              id="auth-header-value"
              placeholder={t("notifications.authHeaderValuePlaceholder")}
              {...form.register("auth_header_value")}
            />
          </div>
        </>
      ) : null}

      <label className="checkbox-row md:col-span-2">
        <input type="checkbox" className="h-4 w-4 border border-border accent-primary" {...form.register("enabled")} />
        {t("common.enabled")}
      </label>

      {validationError ? <p className="text-sm text-destructive md:col-span-2">{validationError}</p> : null}

      <div className="action-row md:col-span-2">
        <Button type="submit" disabled={Boolean(validationError)}>{submitLabel}</Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
