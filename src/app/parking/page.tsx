import Link from "next/link";
import { ArrowRight, LogIn, TriangleAlert, Flag, ScanLine, ShieldCheck, ChevronRight } from "lucide-react";
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

      {/* Primary actions */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-brand">Gate actions</p>
            <h2 className="text-xl font-black leading-tight text-ink">Choose workflow</h2>
          </div>
          <span className="rounded-full bg-brand-tint px-3 py-1 text-[11px] font-black text-brand">
            Primary
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ActionTile
            href="/parking/entry"
            icon={ScanLine}
            title="New Entry"
            subtitle="Capture plate and issue pass"
            action="Start entry"
            primary
          />
          <ActionTile
            href="/parking/exit"
            icon={LogIn}
            iconClass="rotate-180"
            title="Log Exit"
            subtitle="Scan pass and confirm out"
            action="Log exit"
          />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={LogIn}
          label="Entries today"
          value={c.todayEntries}
          trend={{ dir: "up", label: "+18%" }}
          sublabel="vs. yesterday"
        />
        <StatCard
          icon={TriangleAlert}
          label="Overstayed"
          value={c.overstayed}
          sublabel="> 4 hours on site"
          tone="muted"
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
  action,
  primary = false,
}: {
  href: string;
  icon: typeof ScanLine;
  iconClass?: string;
  title: string;
  subtitle: string;
  action: string;
  primary?: boolean;
}) {
  if (primary) {
    return (
      <Link
        href={href}
        className="group relative min-h-[156px] overflow-hidden rounded-xl border border-emerald-400/55 bg-gradient-to-br from-emerald-500 via-emerald-600 to-green-800 p-4 text-white shadow-[0_18px_42px_-18px_rgba(5,150,105,0.78)] transition-all duration-150 active:scale-[0.98]"
      >
        <span className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/8" />
        <span className="relative z-10 flex h-full flex-col justify-between gap-5">
          <span className="flex items-start justify-between gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/25">
              <Icon className={`h-6 w-6 text-white ${iconClass ?? ""}`} />
            </span>
            <ArrowRight className="mt-2 h-5 w-5 text-white/80 transition-transform group-hover:translate-x-1" />
          </span>
          <span>
            <span className="block text-xl font-black leading-none text-white">{title}</span>
            <span className="mt-1.5 block text-sm font-medium text-white/78">{subtitle}</span>
            <span className="mt-4 inline-flex items-center rounded-full bg-white px-2.5 py-1.5 text-[11px] font-black text-emerald-700">
              {action}
            </span>
          </span>
        </span>
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className="group relative min-h-[156px] overflow-hidden rounded-xl border border-brand/45 bg-gradient-to-br from-brand via-brand-hover to-brand-dark p-4 text-white shadow-glass-red transition-all duration-150 active:scale-[0.98]"
    >
      <span className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/8" />
      <span className="relative z-10 flex h-full flex-col justify-between gap-5">
        <span className="flex items-start justify-between gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/18 ring-1 ring-white/25">
            <Icon className={`h-6 w-6 text-white ${iconClass ?? ""}`} />
          </span>
          <ArrowRight className="mt-2 h-5 w-5 text-white/80 transition-transform group-hover:translate-x-1" />
        </span>
        <span>
          <span className="block text-xl font-black leading-none text-white">{title}</span>
          <span className="mt-1.5 block text-sm font-medium text-white/78">{subtitle}</span>
          <span className="mt-4 inline-flex items-center rounded-full bg-white px-2.5 py-1.5 text-[11px] font-black text-brand">
            {action}
          </span>
        </span>
      </span>
    </Link>
  );
}
