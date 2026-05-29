import { faker } from "@faker-js/faker";
import type { VisitorEntity, VisitorStatus } from "@/db/entities";
import type { CreateVisitorInput, VisitorTypeCode } from "@/lib/server/visitors";
import type { VisitorScanState } from "@/lib/server/visitor-state";
import { normalisePlate } from "@/lib/utils";

export const visitorTypeCodes: VisitorTypeCode[] = ["guest", "vendor", "client", "staff"];

export function vehicleNumberFactory() {
  return `${faker.string.alpha({ length: 3, casing: "upper" })} ${faker.number.int({ min: 100, max: 9999 })}`;
}

export function createVisitorInputFactory(overrides: Partial<CreateVisitorInput> = {}): CreateVisitorInput {
  return {
    name: faker.person.fullName(),
    phoneNumber: faker.phone.number({ style: "international" }),
    vehicleNumber: vehicleNumberFactory(),
    typeCode: faker.helpers.arrayElement(visitorTypeCodes),
    remarks: faker.lorem.sentence(),
    guardId: `guard-${faker.string.alphanumeric({ length: 8, casing: "lower" })}`,
    ...overrides,
  };
}

export function visitorScanStateFactory(overrides: Partial<VisitorScanState> = {}): VisitorScanState {
  return {
    status: "pending",
    checkedIn: null,
    checkedOut: null,
    ...overrides,
  };
}

export function visitorEntityFactory(overrides: Partial<VisitorEntity> = {}): VisitorEntity {
  const vehicleNumber = overrides.vehicleNumber ?? vehicleNumberFactory();
  const now = new Date();

  return {
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    phoneNumber: faker.phone.number({ style: "international" }),
    vehicleNumber,
    vehicleNumberNormalised: normalisePlate(vehicleNumber),
    checkedIn: null,
    checkedOut: null,
    typeId: 1,
    remarks: null,
    qrTokenJti: faker.string.uuid(),
    status: "pending" satisfies VisitorStatus,
    createdBy: null,
    checkedInBy: null,
    checkedOutBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
