import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: { id: user.id, email: user.email, credits: user.credits },
  });
}
