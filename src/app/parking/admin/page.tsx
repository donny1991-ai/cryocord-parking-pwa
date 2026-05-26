import type { Metadata } from "next";
import Link from "next/link";
import { Activity, CarFront, Clock, Download, Flag, ChevronRight, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { StatCard } from "@/components/ui/stat-card";
import { VisitRow } from "@/components/parking/visit-row";
import { OccupancyChart } from "@/components/parking/occupancy-chart";
import { data } from "@/lib/data";
import { MOCK_NOW } from "@/lib/mock";

export const metadata: Metadata = { title: "Admin" };

export default function AdminPage() {
  const series = data.occupancySeries();
  const peak = Math.max(...series.map((s) => s.inside));
  const alerts = data.allVisits().filter((v) => v.status === "overstayed" || v.status === "flagged");
  const c = data.counts();

  return (
    <div className="space-y-5">
      <PageHeader title="Admin" subtitle="Occupancy, overstays & blacklist" backHref="/parking" />

      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={CarFront} label="Peak" value={peak} sublabel="vehicles" />
        <StatCard icon={Clock} label="Avg stay" value="1h 48m" />
        <StatCard icon={Flag} label="Flagged" value={c.flagged} />
      </div>

      <GlassCard padding="lg" className="space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Occupancy — today</h2>
        </div>
        <OccupancyChart />
      </GlassCard>

      <section className="space-y-2.5">
        <h2 className="px-1 text-sm font-bold uppercase tracking-wide text-ink-faint">
          Alerts ({alerts.length})
        </h2>
        {alerts.map((v) => (
          <VisitRow key={v.id} visit={v} now={MOCK_NOW} />
        ))}
        {alerts.length === 0 && (
          <p className="py-6 text-center text-sm text-ink-faint">No overstays or flags right now.</p>
        )}
      </section>

      <section className="space-y-2.5">
        <h2 className="px-1 text-sm font-bold uppercase tracking-wide text-ink-faint">Manage</h2>
        <Link href="/parking/vehicles">
          <GlassCard interactive padding="md" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10">
              <CarFront className="h-5 w-5 text-brand" />
            </span>
            <span className="flex-1 font-semibold text-ink">Vehicle registry & blacklist</span>
            <ChevronRight className="h-4 w-4 text-ink-faint" />
          </GlassCard>
        </Link>
        <GlassCard padding="md" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10">
            <Download className="h-5 w-5 text-brand" />
          </span>
          <div className="flex-1">
            <p className="font-semibold text-ink">Export visit log</p>
            <p className="text-xs text-ink-faint">Every export is audit-logged &amp; DPO-gated.</p>
          </div>
          <ChevronRight className="h-4 w-4 text-ink-faint" />
        </GlassCard>
      </section>

      <GlassCard variant="bare" padding="sm" className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
        <p className="text-[11px] leading-relaxed text-ink-faint">
          Visit records auto-purge after 90 days. Audit trail is mirrored to the ICS audit store
          (Azure MY West, 7-year retention) and is append-only.
        </p>
      </GlassCard>
    </div>
  );
}
