import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export function Input({ className, error, ...props }: InputProps) {
  return (
    <div className="space-y-1">
      <input
        className={cn(
          "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none ring-0 transition focus-visible:ring-2 focus-visible:ring-ring",
          error && "border-destructive focus-visible:ring-destructive",
          className
        )}
        {...props}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
