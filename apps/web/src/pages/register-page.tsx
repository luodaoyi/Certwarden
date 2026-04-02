import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

interface RegisterFormValues {
  tenantName: string;
  email: string;
  password: string;
}

export function RegisterPage() {
  const { register: registerAccount } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<RegisterFormValues>({
    defaultValues: {
      tenantName: "",
      email: "",
      password: "",
    },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      setError(null);
      await registerAccount(values);
      setMessage("Registration successful. Please verify your email before logging in.");
      navigate("/login");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to register");
    }
  });

  return (
    <div className="page-shell flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Create account</CardTitle>
          <CardDescription>Each account owns a dedicated tenant workspace and notification settings.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
            <div className="space-y-2">
              <Label htmlFor="tenantName">Workspace name</Label>
              <Input id="tenantName" {...form.register("tenantName")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="register-email">Email</Label>
              <Input id="register-email" type="email" {...form.register("email", { required: true })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="register-password">Password</Label>
              <Input id="register-password" type="password" {...form.register("password", { required: true })} />
            </div>
            {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" type="submit">Create account</Button>
          </form>

          <div className="mt-4 text-sm text-muted-foreground">
            Already have an account? <Link to="/login">Back to login</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
