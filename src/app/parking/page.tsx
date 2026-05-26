import Link from "next/link";
import { LogIn, TriangleAlert, Flag, ScanLine, ShieldCheck, ChevronRight } from "lucide-react";
import { data } from "@/lib/data";
import { MOCK_NOW } from "@/lib/mock";
import { GlassCard } from "@/components/ui/glass-card";
import { StatCard } from "@/components/ui/stat-card";
import { OccupancyHero } from "@/components/parking/occupancy-hero";
import { VisitRow } from "@/components/parking/visit-row";

export default function DashboardPage() {
  const c = data.counts();
  const inside = data.insideVisits();
  const series = data.occupancySeries().map((s) => s.inside);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-ink-faint">Tuesday · 26 May 2026</p>
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink">Live car park</h1>
      </div>

      <OccupancyHero
        currentlyInside={c.currentlyInside}
        normal={c.inside}
        over={c.overstayed}
        flagged={c.flagged}
        series={series}
      />

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={LogIn}
          label="Entries today"
          value={c.todayEntries}
          trend={{ dir: "up", label: "+18%" }}
          sublabel="vs. yesterday"
        />
        <StatCard icon={TriangleAlert} label="Overstayed" value={c.overstayed} sublabel="> 4 hours on site" />
      </div>

      {/* Primary actions */}
      <div className="grid grid-cols-2 gap-3">
        <ActionTile
          href="/parking/entry"
          icon={ScanLine}
          title="New Entry"
          subtitle="Capture · issue pass"
          primary
        />
        <ActionTile
          href="/parking/exit"
          icon={LogIn}
          iconClass="rotate-180"
          title="Log Exit"
          subtitle="Scan · confirm out"
        />
      </div>

      {/* Flagged callout */}
      {c.flagged > 0 && (
        <Link href="/parking/admin">
          <GlassCard
            variant="bare"
            interactive
            padding="sm"
            className="flex items-center gap-3 border-brand/30 bg-brand-tint/70"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/15">
              <Flag className="h-5 w-5 text-brand" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-bold text-brand">
                {c.flagged} flagged vehicle{c.flagged > 1 ? "s" : ""} on site
              </p>
              <p className="text-xs text-ink-soft">Blacklist match — review and escalate.</p>
            </div>
            <ChevronRight className="h-4 w-4 text-brand/60" />
          </GlassCard>
        </Link>
      )}

      {/* Currently inside list */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-label">On site now</h2>
          <Link href="/parking/visits" className="text-xs font-semibold text-brand">
            View all
          </Link>
        </div>
        <div className="stagger-children space-y-2.5">
          {inside.map((v) => (
            <VisitRow key={v.id} visit={v} now={MOCK_NOW} />
          ))}
        </div>
      </section>

      {/* PDPA notice */}
      <GlassCard variant="bare" padding="sm" className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
        <p className="text-[11px] leading-relaxed text-ink-faint">
          Data collected for premises security and access control. Retained 90 days.
          Records reside in Malaysia (Azure MY West). Refer to the CryoCord Privacy Policy.
        </p>
      </GlassCard>
    </div>
  );
}

function ActionTile({
  href,
  icon: Icon,
  iconClass,
  title,
  subtitle,
  primary = false,
}: {
  href: string;
  icon: typeof ScanLine;
  iconClass?: string;
  title: string;
  subtitle: string;
  primary?: boolean;
}) {
  if (primary) {
    return (
      <Link
        href={href}
        className="glass-red glass-interactive flex flex-col gap-3 rounded-3xl p-4"
      >
        <span className="relative z-10 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/25">
          <Icon className={`h-6 w-6 text-white ${iconClass ?? ""}`} />
        </span>
        <span className="relative z-10">
          <span className="block text-base font-bold leading-tight">{title}</span>
          <span className="block text-xs text-white/75">{subtitle}</span>
        </span>
      </Link>
    );
  }
  return (
    <Link href={href} className="glass glass-interactive flex flex-col gap-3 rounded-3xl p-4">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10">
        <Icon className={`h-6 w-6 text-brand ${iconClass ?? ""}`} />
      </span>
      <span>
        <span className="block text-base font-bold leading-tight text-ink">{title}</span>
        <span className="block text-xs text-ink-faint">{subtitle}</span>
      </span>
    </Link>
  );
}
