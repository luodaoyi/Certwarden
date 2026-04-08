import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-border bg-card text-card-foreground shadow-[0_0_0_1px_rgba(240,238,230,0.85),0_8px_28px_rgba(20,20,19,0.05)]",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-2 px-6 pt-6 pb-2 sm:px-7 sm:pt-7", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "font-[Georgia,'Times_New_Roman',serif] text-[27px] font-medium leading-[1.14] tracking-[-0.02em] text-foreground",
        className
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("max-w-3xl text-[15px] leading-[1.6] text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-6 px-6 py-6 sm:px-7", className)} {...props} />;
}
