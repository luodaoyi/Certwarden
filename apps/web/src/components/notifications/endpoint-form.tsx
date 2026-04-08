import { useEffect } from "react";
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
  bot_token: string;
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
  const config = endpoint?.config ?? endpoint?.config_masked ?? {};
  return {
    name: endpoint?.name ?? "",
    type: endpoint?.type ?? "email",
    enabled: endpoint?.enabled ?? true,
    recipient_email: config.recipient_email ?? "",
    bot_token: config.bot_token ?? "",
    chat_id: config.chat_id ?? "",
    url: config.url ?? "",
    auth_header_name: config.auth_header_name ?? "",
    auth_header_value: config.auth_header_value ?? "",
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

  const handleSubmit = form.handleSubmit(async (values) => {
    const config: Record<string, string> = {};
    if (values.type === "email") {
      config.recipient_email = values.recipient_email;
    }
    if (values.type === "telegram") {
      config.bot_token = values.bot_token;
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
    if (values.type === "telegram" && !values.bot_token.trim()) return t("validation.telegramBotTokenRequired");
    if (values.type === "telegram" && !values.chat_id.trim()) return t("validation.telegramChatIdRequired");
    if (values.type === "webhook" && !values.url.trim()) return t("validation.webhookUrlRequired");
    return null;
  })();

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => void handleSubmit(event)}>
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

      {endpointType === "email" ? (
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="endpoint-recipient-email">{t("notifications.recipientEmailLabel")}</Label>
          <Input
            id="endpoint-recipient-email"
            placeholder={t("notifications.primaryEmailPlaceholder")}
            {...form.register("recipient_email")}
          />
        </div>
      ) : null}

      {endpointType === "telegram" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="endpoint-bot-token">{t("notifications.telegramBotTokenLabel")}</Label>
            <Input
              id="endpoint-bot-token"
              placeholder={t("notifications.telegramBotTokenPlaceholder")}
              {...form.register("bot_token")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endpoint-chat-id">{t("notifications.telegramChatIdLabel")}</Label>
            <Input
              id="endpoint-chat-id"
              placeholder={t("notifications.telegramChatPlaceholder")}
              {...form.register("chat_id")}
            />
          </div>
        </>
      ) : null}

      {endpointType === "webhook" ? (
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="endpoint-url">{t("notifications.webhookUrlLabel")}</Label>
          <Input id="endpoint-url" placeholder={t("notifications.webhookUrlPlaceholder")} {...form.register("url")} />
        </div>
      ) : null}

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

      <div className="action-row md:col-span-2 md:justify-end">
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
