import { describe, expect, it } from "vitest";

import { buildVisitLogExcelHtml } from "./visit-export";
import type { Visit } from "./types";

const visit: Visit = {
  id: "v-1",
  plate: "ABC1234",
  visitorName: "Aina & Sons <VIP>",
  visitorContact: "0123456789",
  visitType: "vip",
  purpose: "sample_delivery",
  hostDepartment: "Lab",
  entryTime: "2026-05-26T08:00:00.000Z",
  entryGuardId: "guard-1",
  exitTime: "2026-05-26T09:15:00.000Z",
  exitGuardId: "guard-1",
  status: "exited",
  createdAt: "2026-05-26T08:00:00.000Z",
};

describe("buildVisitLogExcelHtml", () => {
  it("builds an Excel-openable table with labelled values", () => {
    const html = buildVisitLogExcelHtml([visit]);

    expect(html).toContain("<th>Plate</th>");
    expect(html).toContain("<td>ABC1234</td>");
    expect(html).toContain("<td>VIP</td>");
    expect(html).toContain("<td>Sample Delivery</td>");
    expect(html).toContain("<td>Exited</td>");
  });

  it("escapes visitor-provided text", () => {
    const html = buildVisitLogExcelHtml([visit]);

    expect(html).toContain("Aina &amp; Sons &lt;VIP&gt;");
  });
});
