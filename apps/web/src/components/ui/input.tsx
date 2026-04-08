import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export function Input({ className, error, ...props }: InputProps) {
  return (
    <div className="space-y-2">
      <input
        className={cn(
          "flex h-11 w-full rounded-[12px] border border-border bg-[#fffdf8] px-4 py-3 text-[15px] text-foreground placeholder:text-muted-foreground outline-none ring-0 transition focus-visible:border-[#3898ec] focus-visible:ring-2 focus-visible:ring-ring",
          error && "border-destructive focus-visible:ring-destructive",
          className
        )}
        {...props}
      />
      {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
    </div>
  );
}
