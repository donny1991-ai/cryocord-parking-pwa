import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-bold rounded-2xl transition-all duration-150 focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none select-none active:scale-[0.98] whitespace-nowrap",
  {
    variants: {
      variant: {
        primary:
          "bg-brand text-white shadow-glass-red hover:bg-brand-hover hover:shadow-[0_12px_44px_rgba(204,0,0,0.34)]",
        glass:
          "glass text-ink hover:bg-white/75 hover:-translate-y-0.5 shadow-glass",
        outline:
          "border border-brand/30 text-brand bg-white/50 backdrop-blur-md hover:bg-brand-tint hover:border-brand/50",
        ghost: "text-ink-soft hover:bg-black/5",
        subtle: "bg-brand-tint text-brand hover:bg-brand/15",
      },
      size: {
        sm: "h-9 px-3.5 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-13 px-7 text-base",
        xl: "h-16 px-8 text-lg rounded-3xl",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
