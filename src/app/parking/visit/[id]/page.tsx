import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import {
  CalendarPlus,
  Clock,
  DoorOpen,
  FileClock,
  Hash,
  Phone,
  PhoneCall,
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
import { IdentityDocumentRow } from "@/components/parking/identity-document-row";
import { VisitorCancelControl } from "@/components/parking/visitor-cancel-control";
import { VisitorFlagControl } from "@/components/parking/visitor-flag-control";
import { EntrySnapshotControl } from "@/components/parking/entry-snapshot-control";
import { getVisitAuditTrail, getVisitById } from "@/lib/server/parking-data";
import { requireParkingPageUser } from "@/lib/server/page-auth";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { purposeLabel, visitTypeLabel } from "@/lib/labels";
import { buildPassMessage, waLink } from "@/lib/whatsapp";
import type { Employee } from "@/lib/types";

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

  const trail = await getVisitAuditTrail(visit.id);
  const live = visit.status === "inside" || visit.status === "overstayed" || visit.status === "flagged";
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
            additionalPlates: visit.additionalPlates,
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
          additionalPlates={visit.additionalPlates}
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
        <IdentityDocumentRow identityType={visit.identityType} nric={visit.nric} passportNumber={visit.passportNumber} />
        {visit.organisation && (
          <DetailRow icon={Hash} label="Company / organisation" value={visit.organisation} />
        )}
        {(visit.additionalPlates?.length ?? 0) > 0 && (
          <DetailRow icon={Hash} label="Other plates" value={visit.additionalPlates!.join(", ")} />
        )}
        <DetailRow icon={UserRound} label="Host" value={visit.host?.name ?? visit.hostStaffId ?? "—"} />
        <DetailRow icon={primaryTimeRow.icon} label={primaryTimeRow.label} value={primaryTimeRow.value} />
        {visit.visitTime && (
          <DetailRow icon={Clock} label="Visit time" value={visit.visitTime} />
        )}
        {visit.visitorCount && (
          <DetailRow icon={UserRound} label="Visitors" value={String(visit.visitorCount)} />
        )}
        {visit.exitTime && (
          <DetailRow icon={DoorOpen} label="Exit" value={formatDateTime(visit.exitTime)} />
        )}
        {visit.purposeNotes && (
          <DetailRow icon={Hash} label="Notes" value={visit.purposeNotes} />
        )}
      </GlassCard>

      {(visit.host || visit.hostStaffId || visit.hostDepartment) && (
        <HostConfirmationCard
          host={visit.host}
          fallbackStaffId={visit.hostStaffId}
          fallbackDepartment={visit.hostDepartment}
        />
      )}

      {(visit.vehicles?.length ?? 0) > 1 && (
        <GlassCard padding="lg" className="space-y-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-ink-faint">Linked vehicles</p>
            <p className="text-xs text-ink-faint">Each plate checks in and out independently under this registration.</p>
          </div>
          <div className="space-y-2">
            {visit.vehicles!.map((vehicle) => (
              <div
                key={vehicle.id}
                className="flex items-center justify-between rounded-2xl border border-white/60 bg-white/45 px-3 py-2"
              >
                <div>
                  <p className="font-bold tracking-wide text-ink">{vehicle.plate}</p>
                  <p className="text-xs text-ink-faint">
                    {vehicle.isPrimary ? "Primary" : "Linked"} vehicle
                    {vehicle.checkedIn ? ` · In ${formatDateTime(vehicle.checkedIn)}` : ""}
                    {vehicle.checkedOut ? ` · Out ${formatDateTime(vehicle.checkedOut)}` : ""}
                  </p>
                </div>
                <Chip
                  className={
                    vehicle.status === "checked_in"
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
                      : undefined
                  }
                >
                  {vehicle.status === "checked_in" ? "Inside" : vehicle.status.replace("_", " ")}
                </Chip>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {actor.role === "admin" && (
        <VisitorFlagControl
          visitId={visit.id}
          initialReason={visit.flagReason}
          initialFlaggedAt={visit.flaggedAt}
          disabled={!live}
        />
      )}

      <GlassCard padding="md">
        <EntrySnapshotControl
          visitId={visit.id}
          status={visit.status}
          initialSnapshots={visit.entrySnapshots}
        />
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
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-ink">{e.activityTitle ?? e.actionType}</p>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      e.result === "SUCCESS"
                        ? "bg-emerald-500/10 text-emerald-700"
                        : "bg-brand/10 text-brand",
                    )}
                  >
                    {e.result === "SUCCESS" ? "Done" : e.result.toLowerCase()}
                  </span>
                </div>
                {e.activityDescription && (
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">{e.activityDescription}</p>
                )}
                <p className="mt-1 text-[11px] text-ink-faint">
                  {formatDateTime(e.timestampUtc)} · {e.actorLabel ?? e.actorUserId}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Chip tone="brand">{e.actionType}</Chip>
                  <Chip>{e.actorRole}</Chip>
                </div>
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
        <div className="pt-3">
          <Link href={`/parking/exit?visitId=${encodeURIComponent(visit.id)}`}>
            <Button size="xl" className="w-full">
              <DoorOpen className="h-5 w-5" /> Log exit for this vehicle
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function HostConfirmationCard({
  host,
  fallbackStaffId,
  fallbackDepartment,
}: {
  host?: Employee;
  fallbackStaffId?: string;
  fallbackDepartment?: string;
}) {
  const phone = host?.phone;
  return (
    <GlassCard padding="lg" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wide text-ink-faint">Host confirmation</p>
          <p className="mt-1 text-lg font-bold text-ink">{host?.name ?? fallbackStaffId ?? "Host not found"}</p>
          <p className="text-sm text-ink-faint">{host?.department ?? fallbackDepartment ?? "Department unavailable"}</p>
        </div>
        {phone ? (
          <a
            href={`tel:${phone}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
          >
            <PhoneCall className="h-4 w-4" />
            Call
          </a>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-2xl border border-white/60 bg-white/45 px-3 py-2">
          <p className="text-xs text-ink-faint">Phone</p>
          <p className="font-semibold text-ink">{phone ?? "No phone number in HR directory"}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/45 px-3 py-2">
          <p className="text-xs text-ink-faint">Extension</p>
          <p className="font-semibold text-ink">{host?.extension ?? "—"}</p>
        </div>
      </div>
    </GlassCard>
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
