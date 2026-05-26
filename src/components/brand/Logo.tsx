import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * CryoCord brand lockup. Uses the supplied official image for the full logo,
 * with the inline mark kept for compact/icon-only placements.
 */
export function Logo({
  className,
  showWordmark = true,
  showTagline = true,
  inverse = false,
  size = 28,
}: {
  className?: string;
  showWordmark?: boolean;
  showTagline?: boolean;
  inverse?: boolean;
  size?: number;
}) {
  if (showWordmark) {
    return (
      <span className={cn("inline-flex items-center", className)}>
        <Image
          src="/brand/cryocord-logo.png?v=2"
          alt="CryoCord cell & gene"
          width={437}
          height={115}
          priority
          unoptimized
          className={cn("block object-contain", inverse ? "brightness-0 invert" : "mix-blend-multiply")}
          style={{ height: size * 1.45, width: size * 5.5 }}
        />
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <CryoMark size={size} inverse={inverse} />
      {showTagline && <span className="sr-only">CryoCord cell & gene</span>}
    </span>
  );
}

/** The red swirl mark on its own. */
export function CryoMark({ size, inverse = false }: { size: number; inverse?: boolean }) {
  const red = inverse ? "#FFFFFF" : "#C8102E";
  const dark = inverse ? "rgba(255,255,255,0.7)" : "#8E0B20";
  return (
    <svg
      width={size * 1.12}
      height={size}
      viewBox="0 0 46 44"
      fill="none"
      aria-hidden="true"
      role="img"
    >
      {/* Outer sweep — bright red, ~300° spiral opening to the upper right. */}
      <path
        d="M30 6 A18 18 0 1 0 39 27"
        fill="none"
        stroke={red}
        strokeWidth="7"
        strokeLinecap="round"
      />
      {/* Inner counter-curl — darker red, gives the swirl its depth. */}
      <path
        d="M22 13 A9.5 9.5 0 1 1 31 27"
        fill="none"
        stroke={dark}
        strokeWidth="5.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
