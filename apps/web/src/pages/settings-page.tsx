import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiErrorMessage } from "@/lib/api-error";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

interface SettingsFormValues {
  username: string;
  email: string;
}

export function SettingsPage() {
  const { user, updateProfile } = useAuth();
  const { t } = useI18n();
  const getApiErrorMessage = useApiErrorMessage();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<SettingsFormValues>({
    defaultValues: {
      username: user?.username ?? "",
      email: user?.email ?? "",
    },
  });

  useEffect(() => {
    form.reset({
      username: user?.username ?? "",
      email: user?.email ?? "",
    });
  }, [form, user?.email, user?.username]);

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      setError(null);
      setMessage(null);
      await updateProfile(values);
      setMessage(t("settings.saveSuccess"));
    } catch (reason) {
      setError(getApiErrorMessage(reason, t("settings.saveError")));
    }
  });

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>{t("settings.title")}</CardTitle>
        <CardDescription>{t("settings.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5 md:max-w-2xl md:grid-cols-2" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2">
            <Label htmlFor="settings-username">{t("common.username")}</Label>
            <Input id="settings-username" {...form.register("username", { required: true })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-email">{t("common.email")}</Label>
            <Input id="settings-email" type="email" placeholder={t("settings.optionalEmailPlaceholder")} {...form.register("email")} />
            <p className="field-note">{t("settings.emailHint")}</p>
          </div>
          {message ? <p className="text-sm text-emerald-700 md:col-span-2">{message}</p> : null}
          {error ? <p className="text-sm text-destructive md:col-span-2">{error}</p> : null}
          <div className="action-row md:col-span-2">
            <Button className="w-fit" type="submit">{t("common.save")}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}



