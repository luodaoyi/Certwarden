import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      success: "bg-emerald-100 text-emerald-700",
      muted: "bg-secondary text-secondary-foreground",
      warning: "bg-amber-100 text-amber-700",
      destructive: "bg-red-100 text-red-700",
    },
  },
  defaultVariants: {
    variant: "muted",
  },
});

export function Badge({ className, variant, children }: { className?: string; children?: ReactNode } & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)}>{children}</span>;
}
