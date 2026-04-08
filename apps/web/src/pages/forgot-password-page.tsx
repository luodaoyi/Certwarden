import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";

import { PublicPageShell } from "@/components/layout/public-page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiErrorMessage } from "@/lib/api-error";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

interface FormValues {
  account: string;
}

export function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const { t } = useI18n();
  const getApiErrorMessage = useApiErrorMessage();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({ defaultValues: { account: "" } });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      setError(null);
      await forgotPassword(values.account);
      setMessage(t("auth.forgotPasswordSuccess"));
    } catch (reason) {
      setMessage(null);
      setError(getApiErrorMessage(reason, t("auth.loginFallbackError")));
    }
  });

  return (
    <PublicPageShell>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t("auth.forgotPasswordTitle")}</CardTitle>
          <CardDescription>{t("auth.forgotPasswordDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
            <div className="space-y-2">
              <Label htmlFor="forgot-account">{t("auth.usernameOrEmail")}</Label>
              <Input id="forgot-account" {...form.register("account", { required: true })} />
            </div>
            {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" type="submit">{t("auth.sendResetLink")}</Button>
          </form>
          <div className="border-t border-border pt-4 text-sm text-muted-foreground">
            <Link to="/login">{t("auth.backToLogin")}</Link>
          </div>
        </CardContent>
      </Card>
    </PublicPageShell>
  );
}




