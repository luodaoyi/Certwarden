import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-medium uppercase leading-none tracking-[0.08em]", {
  variants: {
    variant: {
      success: "border border-[#cfe4d2] bg-[#edf5ee] text-[#3f6c49]",
      muted: "border border-border bg-[#f1efe6] text-[#5e5d59]",
      warning: "border border-[#ebd8af] bg-[#f8f0d9] text-[#7a5c1f]",
      destructive: "border border-[#e5c0c0] bg-[#faecec] text-[#8b3232]",
    },
  },
  defaultVariants: {
    variant: "muted",
  },
});

export function Badge({ className, variant, children }: { className?: string; children?: ReactNode } & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)}>{children}</span>;
}
