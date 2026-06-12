import "server-only";
import { Brackets, IsNull } from "typeorm";
import { HrUserSchema } from "@/db/entities";
import { getParkingDataSource } from "@/db/client";
import { cacheJson } from "@/lib/server/cache";
import { PARKING_CACHE_KEYS } from "@/lib/server/parking-cache";
import type { Employee } from "@/lib/types";
import { revealHrProtectedText } from "./hr-data-protection";

function normaliseHostKey(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function toEmployee(user: {
  id: number;
  email: string;
  name: string;
  empNo: string | null;
  phone: string | null;
  extension: string | null;
  department?: { name: string; deletedAt?: Date | null } | null;
}): Employee {
  return {
    staffId: user.empNo?.trim() || String(user.id),
    name: user.name,
    department: user.department?.deletedAt ? "Unassigned" : user.department?.name ?? "Unassigned",
    phone: revealHrProtectedText(user.phone) ?? undefined,
    extension: user.extension?.trim() || undefined,
    email: user.email,
  };
}

async function loadHostDirectory(): Promise<Employee[]> {
  let users;
  try {
    const ds = await getParkingDataSource();
    users = await ds.manager.find(HrUserSchema, {
      where: { deletedAt: IsNull() },
      relations: { department: true },
      order: { name: "ASC" },
    });
  } catch {
    return [];
  }

  return users.map(toEmployee);
}

export async function getHostDirectory(): Promise<Employee[]> {
  return cacheJson(PARKING_CACHE_KEYS.hosts, 10 * 60, loadHostDirectory);
}

export async function getHostByStaffId(staffId: string | null | undefined): Promise<Employee | null> {
  const key = normaliseHostKey(staffId);
  if (!key) return null;

  let user;
  try {
    const ds = await getParkingDataSource();
    user = await ds.manager
      .getRepository(HrUserSchema)
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.department", "department")
      .where("user.deleted_at IS NULL")
      .andWhere(
        new Brackets((query) => {
          query
            .where("lower(user.emp_no) = :key", { key })
            .orWhere("CAST(user.id AS text) = :key", { key })
            .orWhere("lower(user.email) = :key", { key })
            .orWhere("lower(user.name) = :key", { key });
        }),
      )
      .getOne();
  } catch {
    return null;
  }

  return user ? toEmployee(user) : null;
}

export async function getHostsByStaffIds(staffIds: Array<string | null | undefined>) {
  const keys = [...new Set(staffIds.map(normaliseHostKey).filter(Boolean))];
  if (keys.length === 0) return new Map<string, Employee>();

  let users;
  try {
    const ds = await getParkingDataSource();
    users = await ds.manager
      .getRepository(HrUserSchema)
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.department", "department")
      .where("user.deleted_at IS NULL")
      .andWhere(
        new Brackets((query) => {
          query
            .where("lower(user.emp_no) IN (:...keys)", { keys })
            .orWhere("CAST(user.id AS text) IN (:...keys)", { keys })
            .orWhere("lower(user.email) IN (:...keys)", { keys })
            .orWhere("lower(user.name) IN (:...keys)", { keys });
        }),
      )
      .getMany();
  } catch {
    return new Map<string, Employee>();
  }

  const byKey = new Map<string, Employee>();
  for (const user of users) {
    const employee = toEmployee(user);
    for (const candidate of [user.empNo, String(user.id), user.email, user.name]) {
      const candidateKey = normaliseHostKey(candidate);
      if (candidateKey) byKey.set(candidateKey, employee);
    }
  }

  return byKey;
}
