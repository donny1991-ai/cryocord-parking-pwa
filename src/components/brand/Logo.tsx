import Image from "next/image";
import { cn } from "@/lib/utils";

const LOGO_SRC = "/brand/cryocord-icon.png";

export function Logo({
  className,
  showWordmark = false,
  showTagline = false,
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
          <span className={cn("font-bold", inverse ? "text-white" : "text-ink")} style={{ fontSize: size * 0.72 }}>
            CryoCord
          </span>
          {showTagline && (
            <span
              className={inverse ? "text-white/70" : "text-ink-faint"}
              style={{
                fontSize: size * 0.26,
                letterSpacing: 0,
                marginTop: size * 0.08,
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

export function CryoMark({ size, inverse = false }: { size: number; inverse?: boolean }) {
  return (
    <Image
      src={LOGO_SRC}
      alt="CryoCord"
      width={Math.round(size)}
      height={Math.round(size)}
      className={cn("shrink-0 object-contain", inverse && "brightness-0 invert")}
      style={{
        width: size,
        height: size,
      }}
    />
  );
}
