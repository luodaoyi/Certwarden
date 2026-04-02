import { useMemo } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const form = useForm<EndpointFormValues>({
    defaultValues: endpointDefaults(endpoint),
  });

  const values = form.watch();
  const endpointType = values.type;

  const requiredPlaceholder = useMemo(() => {
    switch (endpointType) {
      case "email":
        return "recipient@example.com";
      case "telegram":
        return "chat id";
      case "webhook":
        return "https://example.com/hook";
      default:
        return "";
    }
  }, [endpointType]);

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
    if (!values.name.trim()) return "Name is required";
    if (values.type === "email" && !values.recipient_email.trim()) return "Recipient email is required";
    if (values.type === "telegram" && !values.chat_id.trim()) return "Telegram chat id is required";
    if (values.type === "webhook" && !values.url.trim()) return "Webhook URL is required";
    return null;
  })();

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => void handleSubmit(event)}>
      <div className="space-y-2">
        <Label htmlFor="endpoint-name">Name</Label>
        <Input id="endpoint-name" placeholder="Primary email" {...form.register("name")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="endpoint-type">Type</Label>
        <select
          id="endpoint-type"
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
          {...form.register("type")}
        >
          <option value="email">Email</option>
          <option value="telegram">Telegram</option>
          <option value="webhook">Webhook</option>
        </select>
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="endpoint-primary">{requiredPlaceholder}</Label>
        {endpointType === "email" ? (
          <Input id="endpoint-primary" placeholder="recipient@example.com" {...form.register("recipient_email")} />
        ) : null}
        {endpointType === "telegram" ? (
          <Input id="endpoint-primary" placeholder="123456789" {...form.register("chat_id")} />
        ) : null}
        {endpointType === "webhook" ? (
          <Input id="endpoint-primary" placeholder="https://example.com/webhook" {...form.register("url")} />
        ) : null}
      </div>

      {endpointType === "webhook" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="auth-header-name">Auth header name</Label>
            <Input id="auth-header-name" placeholder="X-Webhook-Token" {...form.register("auth_header_name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="auth-header-value">Auth header value</Label>
            <Input id="auth-header-value" placeholder="secret" {...form.register("auth_header_value")} />
          </div>
        </>
      ) : null}

      <label className="flex items-center gap-2 text-sm md:col-span-2">
        <input type="checkbox" className="h-4 w-4 rounded border-border" {...form.register("enabled")} />
        Enabled
      </label>

      {validationError ? <p className="text-sm text-destructive md:col-span-2">{validationError}</p> : null}

      <div className="flex gap-3 md:col-span-2">
        <Button type="submit" disabled={Boolean(validationError)}>{submitLabel}</Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
