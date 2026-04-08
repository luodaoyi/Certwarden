import type { TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export function Textarea({ className, error, ...props }: TextareaProps) {
  return (
    <div className="space-y-2">
      <textarea
        className={cn(
          "flex min-h-24 w-full rounded-[12px] border border-border bg-[#fffdf8] px-4 py-3 text-[15px] text-foreground outline-none transition focus-visible:border-[#3898ec] focus-visible:ring-2 focus-visible:ring-ring",
          error && "border-destructive focus-visible:ring-destructive",
          className
        )}
        {...props}
      />
      {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
    </div>
  );
}
