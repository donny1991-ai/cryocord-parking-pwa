import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const glassCard = cva("rounded-3xl", {
  variants: {
    variant: {
      default: "glass",
      strong: "glass-strong",
      red: "glass-red",
      bare: "bg-white/50 border border-white/40 backdrop-blur-md",
    },
    interactive: {
      true: "glass-interactive cursor-pointer",
      false: "",
    },
    padding: {
      none: "",
      sm: "p-4",
      md: "p-5",
      lg: "p-6",
    },
  },
  defaultVariants: {
    variant: "default",
    interactive: false,
    padding: "md",
  },
});

export interface GlassCardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof glassCard> {}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant, interactive, padding, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(glassCard({ variant, interactive, padding }), className)}
      {...props}
    />
  ),
);
GlassCard.displayName = "GlassCard";
