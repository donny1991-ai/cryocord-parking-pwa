import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/server/auth";
import { requestLoginOtp } from "@/lib/server/auth/otp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = await requestLoginOtp({ email: payload?.email });
    return NextResponse.json(result);
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status });
    }
    throw error;
  }
}
