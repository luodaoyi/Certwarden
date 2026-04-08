import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import type { ApiDomain } from "@/lib/types";

type Translator = ReturnType<typeof useI18n>["t"];

const intervalPresetOptions = [86400, 259200, 604800, 1209600, 2592000] as const;
const intervalPresetValues = [...intervalPresetOptions.map(String), "custom"] as const;
type IntervalPresetValue = (typeof intervalPresetValues)[number];

function presetForInterval(seconds?: number): { interval_preset: IntervalPresetValue; custom_interval_seconds: string } {
  if (!seconds) {
    return { interval_preset: "86400", custom_interval_seconds: "" };
  }

  const preset = intervalPresetOptions.find((value) => value === seconds);
  if (preset) {
    return { interval_preset: String(preset) as IntervalPresetValue, custom_interval_seconds: "" };
  }

  return { interval_preset: "custom", custom_interval_seconds: String(seconds) };
}

function createDomainSchema(t: Translator) {
  return z.object({
    hostname: z.string().trim().min(1, t("validation.hostnameRequired")),
    port: z.coerce
      .number()
      .int(t("validation.portInvalid"))
      .min(1, t("validation.portRange"))
      .max(65535, t("validation.portRange")),
    target_ip: z.string().trim(),
    enabled: z.boolean(),
    interval_preset: z.enum(intervalPresetValues),
    custom_interval_seconds: z.string().trim(),
  }).superRefine((value, ctx) => {
    const custom = value.custom_interval_seconds.trim();
    if (custom === "") {
      if (value.interval_preset === "custom") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t("validation.minInterval"),
          path: ["custom_interval_seconds"],
        });
      }
      return;
    }

    const parsed = Number(custom);
    if (!Number.isInteger(parsed) || parsed < 60) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: t("validation.minInterval"),
        path: ["custom_interval_seconds"],
      });
    }
  }).transform(({ custom_interval_seconds, interval_preset, ...rest }) => ({
    ...rest,
    check_interval_seconds: custom_interval_seconds.trim()
      ? Number(custom_interval_seconds.trim())
      : Number(interval_preset),
  }));
}

function defaultValues(domain?: ApiDomain) {
  const interval = presetForInterval(domain?.check_interval_seconds);
  return {
    hostname: domain?.hostname ?? "",
    port: domain?.port ?? 443,
    target_ip: domain?.target_ip ?? "",
    enabled: domain?.enabled ?? true,
    interval_preset: interval.interval_preset,
    custom_interval_seconds: interval.custom_interval_seconds,
  };
}

type DomainSchema = ReturnType<typeof createDomainSchema>;
type DomainFormInput = z.input<DomainSchema>;
export type DomainPayload = z.output<DomainSchema>;

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
  const { t } = useI18n();
  const schema = createDomainSchema(t);
  const form = useForm<DomainFormInput, undefined, DomainPayload>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues(domain),
  });

  useEffect(() => {
    form.reset(defaultValues(domain));
  }, [domain, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
    if (!domain) {
      form.reset(defaultValues());
    }
  });

  const selectedPreset = form.watch("interval_preset");

  return (
    <form className="grid gap-5 md:grid-cols-2" onSubmit={(event) => void handleSubmit(event)}>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="hostname">{t("common.hostname")}</Label>
        <Input
          id="hostname"
          placeholder={t("domains.hostnamePlaceholder")}
          error={form.formState.errors.hostname?.message}
          {...form.register("hostname")}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="port">{t("common.port")}</Label>
        <Input id="port" type="number" error={form.formState.errors.port?.message} {...form.register("port")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="target_ip">{t("common.targetIp")}</Label>
        <Input id="target_ip" placeholder={t("domains.targetIpPlaceholder")} {...form.register("target_ip")} />
        <p className="field-note">{t("domains.targetIpHint")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="interval_preset">{t("domains.intervalPresetLabel")}</Label>
        <select
          id="interval_preset"
          className="form-select"
          {...form.register("interval_preset")}
        >
          {intervalPresetOptions.map((seconds) => (
            <option key={seconds} value={seconds}>
              {t("domains.intervalPresetDays", { days: Math.round(seconds / 86400) })}
            </option>
          ))}
          <option value="custom">{t("domains.intervalCustomOption")}</option>
        </select>
        <p className="field-note">{t("domains.intervalPresetHint")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="custom_interval_seconds">{t("domains.customIntervalLabel")}</Label>
        <Input
          id="custom_interval_seconds"
          type="number"
          placeholder={selectedPreset === "custom" ? "3600" : String(Number(selectedPreset))}
          error={form.formState.errors.custom_interval_seconds?.message}
          {...form.register("custom_interval_seconds", {
            onChange: (event) => {
              if (event.target.value.trim() !== "") {
                form.setValue("interval_preset", "custom", { shouldDirty: true, shouldValidate: false });
              }
            },
          })}
        />
        <p className="field-note">{t("domains.customIntervalHint")}</p>
      </div>
      <label className="checkbox-row md:col-span-2">
        <input type="checkbox" className="h-4 w-4 border border-border accent-primary" {...form.register("enabled")} />
        {t("common.enabled")}
      </label>
      <div className="action-row md:col-span-2">
        <Button type="submit">{submitLabel}</Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
