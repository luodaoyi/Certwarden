import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const form = useForm<PolicyFormValues>({
    defaultValues: {
      thresholds: policy?.threshold_days.join(", ") ?? "30, 7, 1",
      endpoint_ids: policy?.endpoint_ids ?? [],
    },
  });

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
    <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
      <div className="space-y-2">
        <label className="text-sm font-medium">Thresholds (days, comma separated)</label>
        <Input placeholder="30, 7, 1" {...form.register("thresholds")} />
        <p className="text-xs text-muted-foreground">Current input: {thresholdPreview}</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Channels</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {endpoints.map((endpoint) => (
            <label key={endpoint.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <input
                type="checkbox"
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
              <span>{endpoint.name}</span>
              <span className="text-muted-foreground">({endpoint.type})</span>
            </label>
          ))}
        </div>
      </div>

      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
