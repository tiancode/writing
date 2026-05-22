import { NextRequest, NextResponse } from "next/server";
import {
  authenticate,
  createSession,
  sessionCookieOptions,
  SESSION_COOKIE,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "请填写邮箱和密码" }, { status: 400 });
  }

  const user = authenticate(email, password);
  if (!user) {
    return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
  }

  const token = createSession(user.id);
  const res = NextResponse.json({
    user: { id: user.id, email: user.email, credits: user.credits },
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
