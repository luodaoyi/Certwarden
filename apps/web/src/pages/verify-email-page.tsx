import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

export function VerifyEmailPage() {
  const { verifyEmail } = useAuth();
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
        setError(reason instanceof Error ? reason.message : "Unable to verify email");
      });
  }, [token, verifyEmail]);

  return (
    <div className="page-shell flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Verify email</CardTitle>
          <CardDescription>Complete email verification to unlock login for tenant owner accounts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "loading" ? <p>Verifying your email…</p> : null}
          {status === "success" ? <p className="text-emerald-700">Email verified successfully. You can now sign in.</p> : null}
          {status === "error" ? <p className="text-destructive">{error}</p> : null}
          {!token ? <p className="text-destructive">Missing verification token.</p> : null}
          <Button variant="outline" onClick={() => window.location.assign("/login")}>
            Back to login
          </Button>
          <p className="text-sm text-muted-foreground">
            Need a new account? <Link to="/register">Register again</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
