import { cn } from "@/lib/utils";

const CORD_GREY = "#808184";

/**
 * CryoCord "cell & gene" brand lockup: red swirl mark + lowercase wordmark
 * (cryo = brand red, cord = grey) + "cell & gene" tagline.
 *
 * This is a faithful inline-SVG recreation of the supplied brand artwork. For
 * pixel-perfect fidelity (ICS branding AC), drop the official vector at
 * public/brand/cryocord.svg and point CryoMark/this component at it.
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
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <CryoMark size={size} inverse={inverse} />
      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span
            className="font-bold lowercase tracking-tight"
            style={{ fontSize: size * 0.72 }}
          >
            <span className={inverse ? "text-white" : "text-brand"}>cryo</span>
            <span style={{ color: inverse ? "rgba(255,255,255,0.85)" : CORD_GREY }}>cord</span>
          </span>
          {showTagline && (
            <span
              className="lowercase"
              style={{
                fontSize: size * 0.26,
                letterSpacing: size * 0.06,
                marginTop: size * 0.08,
                color: inverse ? "rgba(255,255,255,0.7)" : CORD_GREY,
              }}
            >
              cell &amp; gene
            </span>
          )}
        </span>
      )}
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
