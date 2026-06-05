import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import {
  CalendarPlus,
  Camera,
  Clock,
  DoorOpen,
  FileClock,
  Hash,
  Phone,
  Send,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusPill, Chip } from "@/components/ui/badge";
import { QrPass } from "@/components/parking/qr-pass";
import { VisitorCancelControl } from "@/components/parking/visitor-cancel-control";
import { VisitorFlagControl } from "@/components/parking/visitor-flag-control";
import { getDemoEmployees, getVisitAuditTrail, getVisitById } from "@/lib/server/parking-data";
import { requireParkingPageUser } from "@/lib/server/page-auth";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { purposeLabel, visitTypeLabel } from "@/lib/labels";
import { buildPassMessage, waLink } from "@/lib/whatsapp";

async function getRequestOrigin() {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configuredOrigin) return configuredOrigin;

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) return null;

  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

export default async function VisitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireParkingPageUser();
  const { id } = await params;
  const [visit, origin] = await Promise.all([getVisitById(id), getRequestOrigin()]);
  if (!visit) notFound();

  const host = visit.hostStaffId
    ? getDemoEmployees().find((e) => e.staffId === visit.hostStaffId)
    : undefined;
  const trail = await getVisitAuditTrail(visit.id);
  const live = visit.status === "inside" || visit.status === "overstayed" || visit.status === "flagged";
  const canQuickRegister = visit.status === "exited";
  const passExpiresAt = visit.qrTokenExpiresAt ? new Date(visit.qrTokenExpiresAt) : null;
  const showActivePass = Boolean(
    visit.qrToken &&
      passExpiresAt &&
      passExpiresAt > new Date() &&
      (visit.status === "pending" || live),
  );
  const passHeading =
    visit.status === "pending"
      ? "Scan at gate to check in"
      : live
        ? "Keep for exit scan"
        : "Archived visitor pass";
  const primaryTimeRow =
    (visit.status === "pending" || visit.status === "cancelled") && visit.visitDate
      ? {
          icon: CalendarPlus,
          label: "Visit date",
          value: formatDate(visit.visitDate),
        }
      : {
          icon: Clock,
          label: visit.status === "pending" ? "Pass issued" : "Entry",
          value: `${formatDateTime(visit.entryTime)} · ${visit.entryGuardId}`,
        };
  const canSendPendingPass = Boolean(showActivePass && visit.status === "pending" && visit.qrToken);
  const canCancelPendingPass = visit.status === "pending";
  const passUrl =
    canSendPendingPass && origin && visit.qrToken
      ? `${origin}/pass/${encodeURIComponent(visit.qrToken)}`
      : undefined;
  const sendViaWhatsappHref =
    canSendPendingPass && visit.qrTokenExpiresAt
      ? waLink(
          visit.visitorContact,
          buildPassMessage({
            visitorName: visit.visitorName,
            plate: visit.plate,
            visitType: visit.visitType,
            validUntil: formatDateTime(visit.qrTokenExpiresAt),
            passUrl,
          }),
        )
      : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={visit.plate}
        subtitle={`${visitTypeLabel(visit.visitType)} · ${purposeLabel(visit.purpose)}`}
        backHref="/parking/visits"
        action={<StatusPill status={visit.status} />}
      />

      {/* Pass */}
      {showActivePass && visit.qrToken && visit.qrTokenExpiresAt && (
        <QrPass
          token={visit.qrToken}
          plate={visit.plate}
          visitorName={visit.visitorName}
          visitType={visit.visitType}
          validUntil={formatDateTime(visit.qrTokenExpiresAt)}
          heading={passHeading}
        />
      )}

      {canSendPendingPass && (
        <div className="mx-auto w-full max-w-sm">
          {sendViaWhatsappHref ? (
            <a
              href={sendViaWhatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
            >
              <Send className="h-4 w-4" /> Send to visitor via WhatsApp
            </a>
          ) : (
            <Button variant="outline" size="lg" className="w-full" disabled>
              <Send className="h-4 w-4" /> Send via WhatsApp
            </Button>
          )}
        </div>
      )}

      {canCancelPendingPass && <VisitorCancelControl visitId={visit.id} />}

      <GlassCard padding="lg" className="space-y-3">
        <DetailRow icon={UserRound} label="Visitor" value={visit.visitorName} />
        <DetailRow icon={Phone} label="Contact" value={visit.visitorContact} />
        {visit.organisation && (
          <DetailRow icon={Hash} label="Company / organisation" value={visit.organisation} />
        )}
        <DetailRow icon={UserRound} label="Host" value={host ? `${host.name} · ${host.department}` : "—"} />
        <DetailRow icon={primaryTimeRow.icon} label={primaryTimeRow.label} value={primaryTimeRow.value} />
        {visit.exitTime && (
          <DetailRow icon={DoorOpen} label="Exit" value={formatDateTime(visit.exitTime)} />
        )}
        {visit.purposeNotes && (
          <DetailRow icon={Hash} label="Notes" value={visit.purposeNotes} />
        )}
      </GlassCard>

      {actor.role === "admin" && live && (
        <VisitorFlagControl visitId={visit.id} initialReason={visit.flagReason} />
      )}

      {canQuickRegister && (
        <div className="pt-2">
          <Link href={`/parking/pre-register?fromVisit=${encodeURIComponent(visit.id)}`}>
            <Button variant="outline" size="xl" className="w-full">
              <CalendarPlus className="h-5 w-5" /> Quick re-register
            </Button>
          </Link>
        </div>
      )}

      {/* Entry photo (Azure Blob, MY West) */}
      <GlassCard padding="md">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-faint">Entry snapshot</p>
        <div className="flex aspect-video items-center justify-center rounded-2xl bg-ink/5 text-ink-faint">
          <div className="flex flex-col items-center gap-1">
            <Camera className="h-7 w-7 opacity-50" />
            <span className="text-xs">{visit.entryPhotoUrl ? "Stored in Azure Blob" : "No snapshot captured"}</span>
          </div>
        </div>
      </GlassCard>

      {/* Audit trail */}
      <GlassCard padding="lg">
        <div className="mb-3 flex items-center gap-2">
          <FileClock className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Audit trail</h2>
        </div>
        <ol className="space-y-3">
          {trail.map((e) => (
            <li key={e.logId} className="flex gap-3">
              <div className="mt-1 flex flex-col items-center">
                <span className="h-2.5 w-2.5 rounded-full bg-brand" />
                <span className="mt-0.5 w-px flex-1 bg-ink-faint/20" />
              </div>
              <div className="flex-1 pb-1">
                <div className="flex items-center gap-2">
                  <Chip tone="brand">{e.actionType}</Chip>
                  <span className="text-xs font-semibold text-emerald-600">{e.result}</span>
                </div>
                <p className="mt-1 text-xs text-ink-faint">
                  {e.actorRole} · {e.actorUserId} · {formatDateTime(e.timestampUtc)}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-faint">
          <ShieldCheck className="h-3.5 w-3.5" />
          Mirrored append-only to the ICS audit store (Azure MY West).
        </p>
      </GlassCard>

      {live && (
        <Link href={`/parking/exit?visitId=${encodeURIComponent(visit.id)}`}>
          <Button size="xl" className="w-full">
            <DoorOpen className="h-5 w-5" /> Log exit for this vehicle
          </Button>
        </Link>
      )}
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-white/50 pb-3 last:border-0 last:pb-0">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
      <div className="flex-1">
        <p className="text-xs text-ink-faint">{label}</p>
        <p className="text-sm font-semibold text-ink">{value}</p>
      </div>
    </div>
  );
}
