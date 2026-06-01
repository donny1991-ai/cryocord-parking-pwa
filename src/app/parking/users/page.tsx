import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { UsersAdmin } from "@/components/parking/users-admin";
import { listParkingUsers } from "@/lib/server/admin-users";
import { requireParkingPageUser } from "@/lib/server/page-auth";

export const metadata: Metadata = { title: "User Management" };

export default async function UsersPage() {
  const actor = await requireParkingPageUser(["admin"]);
  const users = await listParkingUsers();

  return (
    <div>
      <PageHeader title="User Management" subtitle="Create users, roles, and access status" backHref="/parking/admin" />
      <UsersAdmin users={users} actorId={actor.id} />
    </div>
  );
}
