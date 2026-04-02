import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

interface FormValues {
  password: string;
}

export function ResetPasswordPage() {
  const { resetPassword } = useAuth();
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
      setError(reason instanceof Error ? reason.message : "Unable to reset password");
    }
  });

  return (
    <div className="page-shell flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset password</CardTitle>
          <CardDescription>Use the reset token sent to your email.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
            <div className="space-y-2">
              <Label htmlFor="reset-password">New password</Label>
              <Input id="reset-password" type="password" {...form.register("password", { required: true })} />
            </div>
            {!token ? <p className="text-sm text-destructive">Missing token in URL.</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" type="submit" disabled={!token}>Reset password</Button>
          </form>
          <div className="mt-4 text-sm text-muted-foreground">
            <Link to="/login">Back to login</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
