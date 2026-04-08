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

interface LoginFormValues {
  username: string;
  password: string;
}

export function LoginPage() {
  const { login } = useAuth();
  const { t } = useI18n();
  const getApiErrorMessage = useApiErrorMessage();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginFormValues>({
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      setError(null);
      const user = await login(values.username, values.password);
      navigate(user.role === "super_admin" ? "/admin" : "/app");
    } catch (reason) {
      setError(getApiErrorMessage(reason, t("auth.loginFallbackError")));
    }
  });

  return (
    <PublicPageShell>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t("auth.signInTitle")}</CardTitle>
          <CardDescription>{t("auth.signInDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
            <div className="space-y-2">
              <Label htmlFor="username">{t("common.username")}</Label>
              <Input id="username" {...form.register("username", { required: true })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("common.password")}</Label>
              <Input id="password" type="password" {...form.register("password", { required: true })} />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" type="submit">{t("auth.signIn")}</Button>
          </form>

          <div className="flex justify-between border-t border-border pt-4 text-sm text-muted-foreground">
            <Link to="/register">{t("auth.createAccount")}</Link>
            <Link to="/forgot-password">{t("auth.forgotPasswordLink")}</Link>
          </div>
        </CardContent>
      </Card>
    </PublicPageShell>
  );
}



