import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  ClipboardList,
  DoorOpen,
  Flag,
  LogIn,
  QrCode,
  ScanLine,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { getParkingSnapshot } from "@/lib/server/parking-data";
import { GlassCard } from "@/components/ui/glass-card";
import { StatCard } from "@/components/ui/stat-card";
import { OccupancyHero } from "@/components/parking/occupancy-hero";
import { VisitRow } from "@/components/parking/visit-row";

export default async function DashboardPage() {
  const snapshot = await getParkingSnapshot();
  const c = snapshot.counts;
  const inside = snapshot.insideVisits;
  const series = snapshot.occupancySeries.map((s) => s.inside);
  const dashboardDate = snapshot.now.toLocaleDateString("en-MY", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-ink-faint">{dashboardDate}</p>
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink">Live car park</h1>
      </div>

      <OccupancyHero
        currentlyInside={c.currentlyInside}
        normal={c.inside}
        over={c.overstayed}
        flagged={c.flagged}
        series={series}
      />

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand">Gate actions</p>
            <h2 className="text-xl font-bold leading-tight text-ink">Choose workflow</h2>
          </div>
          <span className="rounded-full bg-brand/8 px-3 py-1 text-[11px] font-bold text-brand">Primary</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ActionTile
            href="/parking/entry"
            icon={ScanLine}
            title="New Entry"
            subtitle="Capture plate and issue pass"
            cta="Start entry"
            tone="entry"
          />
          <ActionTile
            href="/parking/exit"
            icon={DoorOpen}
            title="Log Exit"
            subtitle="Scan pass and confirm out"
            cta="Log exit"
            tone="exit"
          />
        </div>

        <ActionTile
          href="/parking/arrival"
          icon={QrCode}
          title="Arrival Scan"
          subtitle="Review a visitor QR before check-in"
          cta="Scan QR"
          tone="arrival"
          compact
        />
        <ActionTile
          href="/parking/requests"
          icon={ClipboardList}
          title="Public Registrations"
          subtitle="Review wall-QR submissions"
          cta="Review"
          tone="request"
          compact
        />
      </section>

      <section className="space-y-3">
        <h2 className="section-label">Today at a glance</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={LogIn}
            label="Entries today"
            value={c.todayEntries}
            trend={{ dir: "up", label: "+18%" }}
            sublabel="vs. yesterday"
          />
          <StatCard icon={TriangleAlert} label="Overstayed" value={c.overstayed} sublabel="Needs attention" />
        </div>
      </section>

      {/* Flagged callout */}
      {c.flagged > 0 && (
        <Link href="/parking/admin" className="block">
          <GlassCard
            variant="bare"
            interactive
            padding="sm"
            className="flex min-h-[4.75rem] items-center gap-3 border-brand/30 bg-brand-tint/70"
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
            <VisitRow key={`${v.id}:${v.vehicleId ?? "registration"}`} visit={v} now={snapshot.now} />
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
  title,
  subtitle,
  cta,
  tone,
  compact = false,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  cta: string;
  tone: "entry" | "exit" | "arrival" | "request";
  compact?: boolean;
}) {
  const toneClasses = {
    entry:
      "bg-[linear-gradient(145deg,#18bd88_0%,#0b8b58_88%)] text-white shadow-[0_22px_44px_-24px_rgba(9,132,82,0.65)]",
    exit:
      "bg-[linear-gradient(145deg,#e1092b_0%,#9f001c_88%)] text-white shadow-[0_22px_44px_-24px_rgba(200,16,46,0.7)]",
    arrival:
      "glass border-emerald-500/18 bg-white/65 text-ink shadow-[0_16px_36px_-24px_rgba(20,22,60,0.32)]",
    request:
      "glass border-sky-500/18 bg-white/65 text-ink shadow-[0_16px_36px_-24px_rgba(20,22,60,0.32)]",
  }[tone];
  const iconClasses = {
    entry: "bg-white/18 text-white ring-white/25",
    exit: "bg-white/18 text-white ring-white/25",
    arrival: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
    request: "bg-sky-500/10 text-sky-700 ring-sky-500/20",
  }[tone];
  const ctaClasses = {
    entry: "bg-white text-emerald-700",
    exit: "bg-white text-brand",
    arrival: "bg-emerald-500/10 text-emerald-700",
    request: "bg-sky-500/10 text-sky-700",
  }[tone];

  return (
    <Link
      href={href}
      className={`glass-interactive group relative overflow-hidden rounded-3xl p-4 ${toneClasses} ${
        compact ? "flex min-h-[5.5rem] items-center gap-3" : "flex min-h-[12rem] flex-col justify-between"
      }`}
    >
      {!compact && <ArrowRight className="absolute right-4 top-5 h-5 w-5 opacity-85 transition-transform group-hover:translate-x-0.5" />}
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ${iconClasses}`}>
        <Icon className="h-6 w-6" />
      </span>
      <span className={compact ? "min-w-0 flex-1" : "block"}>
        <span className={`block font-bold leading-tight ${compact ? "text-base" : "text-xl"}`}>{title}</span>
        <span className={`mt-1 block text-sm ${tone === "entry" || tone === "exit" ? "text-white/88" : "text-ink-faint"}`}>
          {subtitle}
        </span>
        <span className={`mt-4 inline-flex rounded-full px-3 py-1.5 text-xs font-bold ${ctaClasses}`}>{cta}</span>
      </span>
      {compact && <ArrowRight className={`h-5 w-5 shrink-0 ${tone === "request" ? "text-sky-700" : "text-emerald-700"}`} />}
    </Link>
  );
}
