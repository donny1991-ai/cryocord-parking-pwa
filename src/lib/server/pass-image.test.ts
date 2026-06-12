import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { linkedVehicleSummary, renderVisitorPassImagePng, visitorPassImageFilename } from "./pass-image";

describe("visitor pass image renderer", () => {
  it("renders a PNG with the visitor pass template dimensions", async () => {
    const png = await renderVisitorPassImagePng({
      token: "opaque-parking-token",
      plate: "WA 18 K",
      additionalPlates: ["PX 900"],
      visitorName: "Nadia Visitor",
      visitTypeLabel: "Visitor",
      visitDate: "10 June 2026",
      validUntil: "10 June at 23:59",
    });

    expect(Buffer.isBuffer(png)).toBe(true);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    await expect(sharp(png).metadata()).resolves.toMatchObject({ width: 1054, height: 1492 });
    const details = await sharp(png)
      .extract({ left: 232, top: 955, width: 590, height: 220 })
      .removeAlpha()
      .raw()
      .toBuffer();
    let darkPixelCount = 0;
    for (let index = 0; index < details.length; index += 3) {
      if (details[index] < 80 && details[index + 1] < 80 && details[index + 2] < 80) {
        darkPixelCount += 1;
      }
    }
    expect(darkPixelCount).toBeGreaterThan(1_000);
    expect(visitorPassImageFilename("WA 18 K")).toBe("cryocord-pass-wa-18-k.png");
  });

  it("summarises linked vehicles without listing plate numbers", () => {
    expect(linkedVehicleSummary(undefined)).toBeNull();
    expect(linkedVehicleSummary([])).toBeNull();
    expect(linkedVehicleSummary(["AHA 456"])).toBe("+1 vehicle");
    expect(linkedVehicleSummary(["AHA 456", "WWW 199"])).toBe("+2 vehicles");
  });
});
