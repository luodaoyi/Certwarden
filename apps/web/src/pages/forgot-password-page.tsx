import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

interface FormValues {
  email: string;
}

export function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<FormValues>({ defaultValues: { email: "" } });

  const handleSubmit = form.handleSubmit(async (values) => {
    await forgotPassword(values.email);
    setMessage("If the address exists, a reset link has been sent.");
  });

  return (
    <div className="page-shell flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Forgot password</CardTitle>
          <CardDescription>We'll send a reset link to your registered email address.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
            <div className="space-y-2">
              <Label htmlFor="forgot-email">Email</Label>
              <Input id="forgot-email" type="email" {...form.register("email", { required: true })} />
            </div>
            {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
            <Button className="w-full" type="submit">Send reset link</Button>
          </form>
          <div className="mt-4 text-sm text-muted-foreground">
            <Link to="/login">Back to login</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
