import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";

import { PublicPageShell } from "@/components/layout/public-page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiErrorMessage } from "@/lib/api-error";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

interface RegisterFormValues {
  username: string;
  password: string;
}

export function RegisterPage() {
  const { register: registerAccount } = useAuth();
  const { t } = useI18n();
  const getApiErrorMessage = useApiErrorMessage();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<RegisterFormValues>({
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      setError(null);
      await registerAccount(values);
      setMessage(t("auth.registrationSuccess"));
      navigate("/login");
    } catch (reason) {
      setError(getApiErrorMessage(reason, t("auth.registrationFallbackError")));
    }
  });

  return (
    <PublicPageShell>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t("auth.createAccount")}</CardTitle>
          <CardDescription>{t("auth.createAccountDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
            <div className="space-y-2">
              <Label htmlFor="register-username">{t("common.username")}</Label>
              <Input id="register-username" {...form.register("username", { required: true })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="register-password">{t("common.password")}</Label>
              <Input id="register-password" type="password" {...form.register("password", { required: true })} />
            </div>
            {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" type="submit">{t("auth.createAccountButton")}</Button>
          </form>

          <div className="border-t border-border pt-4 text-sm text-muted-foreground">
            {t("auth.alreadyHaveAccount")} <Link to="/login">{t("auth.backToLogin")}</Link>
          </div>
        </CardContent>
      </Card>
    </PublicPageShell>
  );
}



