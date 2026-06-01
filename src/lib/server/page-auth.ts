import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AuthError,
  PARKING_SESSION_COOKIE,
  getParkingUserForToken,
  type AuthenticatedParkingUser,
} from "@/lib/server/auth";
import type { ParkingUserRole } from "@/db/entities";

export async function requireParkingPageUser(
  allowedRoles: ParkingUserRole[] = ["guard", "supervisor", "admin"],
): Promise<AuthenticatedParkingUser> {
  const token = (await cookies()).get(PARKING_SESSION_COOKIE)?.value;
  if (!token) {
    redirect("/login");
  }

  try {
    return await getParkingUserForToken(token, allowedRoles);
  } catch (error) {
    if (error instanceof AuthError && error.status === 403) {
      redirect("/parking");
    }
    redirect("/login");
  }
}
