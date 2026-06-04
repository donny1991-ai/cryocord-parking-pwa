import { NextResponse } from "next/server";
import { PARKING_SESSION_COOKIE, authErrorResponse } from "@/lib/server/auth";
import { verifyLoginOtp } from "@/lib/server/auth/otp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = await verifyLoginOtp({ email: payload?.email, otp: payload?.otp });
    const response = NextResponse.json(result);
    response.cookies.set(PARKING_SESSION_COOKIE, result.accessToken, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: result.expiresIn,
    });
    return response;
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status });
    }
    throw error;
  }
}
