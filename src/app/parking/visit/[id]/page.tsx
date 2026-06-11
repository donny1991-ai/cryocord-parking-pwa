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
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { StatusPill, Chip } from "@/components/ui/badge";
import { QrPass } from "@/components/parking/qr-pass";
import { QrPassShareButton } from "@/components/parking/qr-pass-share-button";
import { IdentityDocumentRow } from "@/components/parking/identity-document-row";
import { VisitorCancelControl } from "@/components/parking/visitor-cancel-control";
import { VisitorFlagControl } from "@/components/parking/visitor-flag-control";
import { EntrySnapshotControl } from "@/components/parking/entry-snapshot-control";
import { VisitorHostEditControl } from "@/components/parking/visitor-host-edit-control";
import { getVisitAuditTrail, getVisitById } from "@/lib/server/parking-data";
import { requireParkingPageUser } from "@/lib/server/page-auth";
import { getHostDirectory } from "@/lib/server/hosts";
import { isVisitorHostEditOpen } from "@/lib/server/admin-visitors";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { purposeLabel, visitTypeLabel } from "@/lib/labels";
import { buildPassMessage, waLink } from "@/lib/whatsapp";
import { canShareVisitPass, getVisitPassHeading } from "@/lib/visitor-pass";

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
  const [visit, origin, employees] = await Promise.all([getVisitById(id), getRequestOrigin(), getHostDirectory()]);
  if (!visit) notFound();

  const trail = await getVisitAuditTrail(visit.id);
  const live = visit.status === "inside" || visit.status === "overstayed" || visit.status === "flagged";
  const showActivePass = canShareVisitPass({
    status: visit.status,
    qrToken: visit.qrToken,
    qrTokenExpiresAt: visit.qrTokenExpiresAt,
  });
  const passHeading = getVisitPassHeading(visit.status);
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
  const canShareActivePass = Boolean(showActivePass && visit.qrToken);
  const canCancelPendingPass = visit.status === "pending";
  const statusNote =
    visit.status === "no_show"
      ? "This registration is still stored as pending, but its arrival window has expired with no recorded arrival."
      : visit.status === "partially_arrived"
        ? "Some linked vehicles have activity, while at least one linked vehicle is still pending."
        : null;
  const additionalVisitorCount = Math.max(0, (visit.visitorCount ?? 1) - 1);
  const passUrl =
    canShareActivePass && origin && visit.qrToken
      ? `${origin}/pass/${encodeURIComponent(visit.qrToken)}`
      : undefined;
  const pendingPassValidUntil = visit.qrTokenExpiresAt ? formatDateTime(visit.qrTokenExpiresAt) : null;
  const pendingPassMessage =
    canShareActivePass && pendingPassValidUntil
      ? buildPassMessage({
          visitorName: visit.visitorName,
          plate: visit.plate,
          additionalPlates: visit.additionalPlates,
          visitType: visit.visitType,
          validUntil: pendingPassValidUntil,
          passUrl,
        })
      : null;
  const sendViaWhatsappHref =
    pendingPassMessage
      ? waLink(visit.visitorContact, pendingPassMessage)
      : null;
  const canEditHost = isVisitorHostEditOpen(visit.visitDate ?? null, visit.createdAt);

  return (
    <div className="space-y-5">
      <PageHeader
        title={visit.plate}
        subtitle={`${visitTypeLabel(visit.visitType)} · ${purposeLabel(visit.purpose)}`}
        backHref="/parking/visits"
        action={<StatusPill status={visit.status} />}
      />

      {statusNote && (
        <div className="rounded-2xl border border-white/60 bg-white/50 px-3.5 py-3 text-xs font-semibold leading-relaxed text-ink-soft backdrop-blur-md">
          {statusNote}
        </div>
      )}

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

      {canShareActivePass && visit.qrToken && pendingPassValidUntil && pendingPassMessage && (
        <div className="mx-auto w-full max-w-sm">
          <QrPassShareButton
            token={visit.qrToken}
            plate={visit.plate}
            additionalPlates={visit.additionalPlates}
            visitorName={visit.visitorName}
            visitType={visit.visitType}
            validUntil={pendingPassValidUntil}
            heading={passHeading}
            message={pendingPassMessage}
            whatsappHref={sendViaWhatsappHref}
          />
          {!sendViaWhatsappHref && (
            <p className="mt-2 text-center text-xs text-ink-faint">Add a valid contact number to open WhatsApp text.</p>
          )}
        </div>
      )}

      {canCancelPendingPass && <VisitorCancelControl visitId={visit.id} />}

      <GlassCard padding="lg" className="space-y-3">
        <DetailRow icon={UserRound} label="Main visitor" value={visit.visitorName} />
        {((visit.otherVisitorNames?.length ?? 0) > 0 || additionalVisitorCount > 0) && (
          <div className="rounded-2xl border border-white/60 bg-white/45 px-3.5 py-3">
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-ink-faint" />
              <p className="text-sm font-bold text-ink-soft">Additional visitors</p>
            </div>
            {(visit.otherVisitorNames?.length ?? 0) > 0 ? (
              <ol className="mt-2 space-y-1.5">
                {visit.otherVisitorNames!.map((name, index) => (
                  <li key={`${name}-${index}`} className="flex items-center gap-2 rounded-xl bg-white/50 px-3 py-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-bold text-brand">
                      {index + 1}
                    </span>
                    <span className="text-sm font-semibold text-ink">{name}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 rounded-xl bg-white/50 px-3 py-2 text-sm font-semibold text-ink-soft">
                {additionalVisitorCount} additional visitor{additionalVisitorCount === 1 ? "" : "s"} recorded, but name details are not available for this registration.
              </p>
            )}
          </div>
        )}
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

      {(visit.host || visit.hostStaffId || visit.hostDepartment || canEditHost) && (
        <VisitorHostEditControl
          visitId={visit.id}
          employees={employees}
          currentHost={visit.host}
          currentHostStaffId={visit.hostStaffId}
          currentHostDepartment={visit.hostDepartment}
          canEdit={canEditHost}
        />
      )}

      {(visit.vehicles?.length ?? 0) > 1 && (
        <GlassCard padding="lg" className="space-y-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-ink-faint">Linked vehicles</p>
            <p className="text-xs text-ink-faint">Each plate checks in and out independently under this registration.</p>
          </div>
          <div className="space-y-2">
            {visit.vehicles!.map((vehicle) => {
              const displayStatus = vehicle.displayStatus ?? (
                vehicle.status === "checked_in"
                  ? "inside"
                  : vehicle.status === "checked_out"
                    ? "exited"
                    : vehicle.status === "cancelled" || vehicle.status === "rejected"
                      ? "cancelled"
                      : "pending"
              );
              return (
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
                      {displayStatus === "no_show" ? " · Arrival window expired" : ""}
                    </p>
                  </div>
                  <StatusPill status={displayStatus} />
                </div>
              );
            })}
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
