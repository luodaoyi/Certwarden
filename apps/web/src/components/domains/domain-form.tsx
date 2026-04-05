import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ApiDomain } from "@/lib/types";

const schema = z.object({
  hostname: z.string().trim().min(1, "Hostname is required"),
  port: z.coerce.number().int().min(1).max(65535),
  enabled: z.boolean(),
  check_interval_seconds: z.coerce.number().int().min(60, "Minimum interval is 60 seconds"),
});

type DomainFormInput = z.input<typeof schema>;
export type DomainPayload = z.output<typeof schema>;

export function DomainForm({
  domain,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  domain?: ApiDomain;
  submitLabel: string;
  onSubmit: (payload: DomainPayload) => Promise<void>;
  onCancel?: () => void;
}) {
  const form = useForm<DomainFormInput, undefined, DomainPayload>({
    resolver: zodResolver(schema),
    defaultValues: {
      hostname: domain?.hostname ?? "",
      port: domain?.port ?? 443,
      enabled: domain?.enabled ?? true,
      check_interval_seconds: domain?.check_interval_seconds ?? 3600,
    },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
    if (!domain) {
      form.reset({
        hostname: "",
        port: 443,
        enabled: true,
        check_interval_seconds: 3600,
      });
    }
  });

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => void handleSubmit(event)}>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="hostname">Hostname</Label>
        <Input id="hostname" placeholder="example.com" error={form.formState.errors.hostname?.message} {...form.register("hostname")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="port">Port</Label>
        <Input id="port" type="number" error={form.formState.errors.port?.message} {...form.register("port")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="check_interval_seconds">Check interval (seconds)</Label>
        <Input
          id="check_interval_seconds"
          type="number"
          error={form.formState.errors.check_interval_seconds?.message}
          {...form.register("check_interval_seconds")}
        />
      </div>
      <label className="flex items-center gap-2 text-sm md:col-span-2">
        <input type="checkbox" className="h-4 w-4 rounded border-border" {...form.register("enabled")} />
        Enabled
      </label>
      <div className="flex gap-3 md:col-span-2">
        <Button type="submit">{submitLabel}</Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
