import { type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] border text-[14px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-[1px] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground shadow-[0_0_0_1px_rgba(201,100,66,0.18),0_10px_24px_rgba(20,20,19,0.10)] hover:bg-[#b75a3b]",
        secondary: "border-border bg-secondary text-secondary-foreground shadow-[0_0_0_1px_rgba(209,207,197,0.85)] hover:bg-[#e1dfd3]",
        outline: "border-border bg-[#fffdf8] text-foreground shadow-[0_0_0_1px_rgba(240,238,230,0.8)] hover:bg-[#f3f0e6]",
        ghost: "border-transparent bg-transparent text-muted-foreground hover:bg-[#edeade] hover:text-foreground",
        destructive: "border-[#b53333] bg-destructive text-destructive-foreground shadow-[0_0_0_1px_rgba(181,51,51,0.2),0_10px_20px_rgba(20,20,19,0.08)] hover:bg-[#9d2b2b]",
        command: "border-[#30302e] bg-accent text-accent-foreground shadow-[0_0_0_1px_rgba(48,48,46,0.9),0_10px_20px_rgba(20,20,19,0.10)] hover:border-[#d97757] hover:bg-[#232320] hover:text-[#fff7f2] active:border-[#d97757] active:bg-[#d97757] active:text-[#1f1611] focus-visible:ring-[#d97757]",
        glass: "border-[#4a4945] bg-[#30302e] text-[#faf9f5] shadow-[0_0_0_1px_rgba(74,73,69,0.7)] hover:bg-[#242421]",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-11 px-5 text-[15px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
