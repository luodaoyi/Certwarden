import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { PublicPageShell } from "@/components/layout/public-page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApiErrorMessage } from "@/lib/api-error";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export function VerifyEmailPage() {
  const { verifyEmail } = useAuth();
  const { t } = useI18n();
  const getApiErrorMessage = useApiErrorMessage();
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token") ?? "", [params]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    setStatus("loading");
    void verifyEmail(token)
      .then(() => setStatus("success"))
      .catch((reason) => {
        setStatus("error");
        setError(getApiErrorMessage(reason, t("auth.verifyEmailFallbackError")));
      });
  }, [getApiErrorMessage, t, token, verifyEmail]);

  return (
    <PublicPageShell>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t("auth.verifyEmailTitle")}</CardTitle>
          <CardDescription>{t("auth.verifyEmailDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "loading" ? <p>{t("auth.verifyingEmail")}</p> : null}
          {status === "success" ? <p className="text-emerald-700">{t("auth.verifyEmailSuccess")}</p> : null}
          {status === "error" ? <p className="text-destructive">{error}</p> : null}
          {!token ? <p className="text-destructive">{t("auth.missingVerifyToken")}</p> : null}
          <Button variant="outline" onClick={() => window.location.assign("/login")}>
            {t("auth.backToLogin")}
          </Button>
          <p className="border-t border-border pt-4 text-sm text-muted-foreground">
            {t("auth.needNewAccount")} <Link to="/register">{t("auth.registerAgain")}</Link>
          </p>
        </CardContent>
      </Card>
    </PublicPageShell>
  );
}




