/**
 * Single data-access seam for the UI. Today it returns deterministic demo data
 * from lib/mock. When the self-hosted Supabase instance (Azure MY West) is
 * live, swap these implementations for queries against the `parking` schema —
 * the screens won't change.
 */
import {
  auditTrail,
  counts,
  employees,
  getVehicleByPlate,
  getVisit,
  insideVisits,
  occupancySeries,
  recentVisits,
  vehicles,
  visits,
} from "./mock";

export const data = {
  counts,
  insideVisits,
  recentVisits,
  allVisits: () => [...visits].sort((a, b) => b.entryTime.localeCompare(a.entryTime)),
  getVisit,
  vehicles: () => vehicles,
  getVehicleByPlate,
  employees: () => employees,
  occupancySeries,
  auditTrail,
};
