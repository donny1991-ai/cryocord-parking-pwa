import { NextResponse, type NextRequest } from "next/server";
import { renderVisitorPassImagePng, visitorPassImageFilename } from "@/lib/server/pass-image";
import { getPublicVisitorPass } from "@/lib/server/visitors";
import { formatDate, formatDateTime } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";
  if (!token) {
    return NextResponse.json({ error: "Pass token is required." }, { status: 400 });
  }

  const pass = await getPublicVisitorPass(token);
  if (pass.state !== "active") {
    return NextResponse.json({ error: pass.message }, { status: 404 });
  }

  const png = await renderVisitorPassImagePng({
    token: pass.token,
    plate: pass.plate,
    additionalPlates: pass.additionalPlates,
    visitorName: pass.visitorName,
    visitTypeLabel: pass.visitTypeLabel,
    visitDate: formatDate(pass.visitDate ?? pass.validUntil),
    validUntil: formatDateTime(pass.validUntil),
  });
  const body = new ArrayBuffer(png.byteLength);
  new Uint8Array(body).set(png);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${visitorPassImageFilename(pass.plate)}"`,
      "Cache-Control": "no-store",
    },
  });
}
