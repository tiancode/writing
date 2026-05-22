import { NextRequest, NextResponse } from "next/server";
import {
  createUser,
  createSession,
  EmailTakenError,
  isValidEmail,
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

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "密码至少 8 位" },
      { status: 400 }
    );
  }

  let user;
  try {
    user = createUser(email, password);
  } catch (err) {
    if (err instanceof EmailTakenError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  const token = createSession(user.id);
  const res = NextResponse.json({
    user: { id: user.id, email: user.email, credits: user.credits },
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
