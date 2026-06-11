import { Car } from "lucide-react";

/** Build a sparkline line + area path from a value series. */
function sparkPaths(values: number[], w = 100, h = 32) {
  if (values.length < 2) return { line: "", area: "" };
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const stepX = w / (values.length - 1);
  const pts = values.map((v, i) => [i * stepX, h - ((v - min) / range) * (h - 4) - 2]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  return { line, area, last: pts[pts.length - 1] };
}

/**
 * Dashboard hero — currently-inside count with a live pulse, the normal/over/
 * flagged breakdown, and a sparkline of today's occupancy.
 */
export function OccupancyHero({
  currentlyInside,
  normal,
  over,
  flagged,
  series,
}: {
  currentlyInside: number;
  normal: number;
  over: number;
  flagged: number;
  series: number[];
}) {
  const { line, area, last } = sparkPaths(series);

  return (
    <div className="relative overflow-hidden rounded-4xl border border-amber-500/35 bg-[linear-gradient(145deg,#f7c842_0%,#d69000_62%,#a86600_100%)] p-6 text-white shadow-[0_22px_54px_-22px_rgba(180,105,0,0.65)]">
      <div className="absolute inset-x-0 bottom-0 h-[40%] bg-[linear-gradient(180deg,rgba(113,66,0,0.24),rgba(255,202,64,0.2))]" />

      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/85">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-white" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
            Currently inside
          </span>
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/12 ring-1 ring-white/35">
            <Car className="h-5 w-5 text-white" />
          </span>
        </div>

        <div className="mt-3 flex items-end gap-2">
          <span className="text-6xl font-bold leading-none tabular-nums tracking-tight">
            {currentlyInside}
          </span>
          <span className="mb-1 text-sm text-white/70">vehicles</span>
        </div>

        {/* Breakdown */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Breakdown label="Normal" value={normal} dot="bg-emerald-300" />
          <Breakdown label="Overstayed" value={over} dot="bg-white" />
          <Breakdown label="Flagged" value={flagged} dot="bg-brand" />
        </div>

        {/* Sparkline */}
        <div className="mt-5">
          <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-10 w-full overflow-visible">
            <defs>
              <linearGradient id="heroSpark" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fff" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#heroSpark)" />
            <path
              d={line}
              fill="none"
              stroke="rgba(255,255,255,0.9)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {last && <circle cx={last[0]} cy={last[1]} r="2.4" fill="#fff" vectorEffect="non-scaling-stroke" />}
          </svg>
          <p className="mt-1 text-[11px] font-medium text-white/75">Occupancy · today 08:00–14:00</p>
        </div>
      </div>
    </div>
  );
}

function Breakdown({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/16 px-2.5 py-1 text-xs font-semibold ring-1 ring-white/30 backdrop-blur">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {value} {label}
    </span>
  );
}
