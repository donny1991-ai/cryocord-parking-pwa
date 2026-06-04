import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PreRegisterFlow, type PreRegisterInitialValues } from "@/components/parking/pre-register-flow";
import { getDemoEmployees, getParkingVehicles, getVisitById } from "@/lib/server/parking-data";

export const metadata: Metadata = { title: "Pre-register Visitor" };

export default async function PreRegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ fromVisit?: string | string[] }>;
}) {
  const vehicles = await getParkingVehicles();
  const fromVisit = await resolveFromVisit(searchParams);
  const initialValues = await getInitialValues(fromVisit);

  return (
    <div>
      <PageHeader
        title="Pre-register"
        subtitle={initialValues ? "Previous visitor details pre-filled" : "Create a pending visitor QR before arrival"}
        backHref="/parking"
      />
      <PreRegisterFlow employees={getDemoEmployees()} vehicles={vehicles} initialValues={initialValues} />
    </div>
  );
}

async function resolveFromVisit(searchParams?: Promise<{ fromVisit?: string | string[] }>) {
  const params = await searchParams;
  const value = params?.fromVisit;
  return Array.isArray(value) ? value[0] : value;
}

async function getInitialValues(fromVisit?: string): Promise<PreRegisterInitialValues | undefined> {
  if (!fromVisit) return undefined;
  const visit = await getVisitById(fromVisit);
  if (!visit) return undefined;

  return {
    plate: visit.plate,
    visitorName: visit.visitorName,
    visitorContact: visit.visitorContact,
    visitType: visit.visitType,
    purpose: visit.purpose,
    purposeNotes: visit.purposeNotes,
    hostStaffId: visit.hostStaffId,
  };
}
