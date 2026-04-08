import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex shrink-0 items-center whitespace-nowrap border px-2.5 py-1 text-[11px] font-semibold leading-none uppercase tracking-[0.14em]", {
  variants: {
    variant: {
      success: "border-emerald-300 bg-emerald-50 text-emerald-800",
      muted: "border-border bg-secondary text-secondary-foreground",
      warning: "border-amber-300 bg-amber-50 text-amber-800",
      destructive: "border-red-300 bg-red-50 text-red-800",
    },
  },
  defaultVariants: {
    variant: "muted",
  },
});

export function Badge({ className, variant, children }: { className?: string; children?: ReactNode } & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)}>{children}</span>;
}
