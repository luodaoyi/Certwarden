import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
  password: string;
}

export function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const { t } = useI18n();
  const getApiErrorMessage = useApiErrorMessage();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token") ?? "", [params]);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({ defaultValues: { password: "" } });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await resetPassword(token, values.password);
      navigate("/login");
    } catch (reason) {
      setError(getApiErrorMessage(reason, t("auth.resetPasswordFallbackError")));
    }
  });

  return (
    <PublicPageShell>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t("auth.resetPasswordTitle")}</CardTitle>
          <CardDescription>{t("auth.resetPasswordDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
            <div className="space-y-2">
              <Label htmlFor="reset-password">{t("common.newPassword")}</Label>
              <Input id="reset-password" type="password" {...form.register("password", { required: true })} />
            </div>
            {!token ? <p className="text-sm text-destructive">{t("auth.missingResetToken")}</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" type="submit" disabled={!token}>{t("auth.resetPasswordButton")}</Button>
          </form>
          <div className="border-t border-border pt-4 text-sm text-muted-foreground">
            <Link to="/login">{t("auth.backToLogin")}</Link>
          </div>
        </CardContent>
      </Card>
    </PublicPageShell>
  );
}



