import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, getUserBySession, type User } from "./auth";

/** Resolve the logged-in user from a route handler's request, or null. */
export function getUserFromRequest(req: NextRequest): User | null {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return getUserBySession(token);
}

/** Resolve the logged-in user inside a Server Component / route, or null. */
export async function getUserFromCookies(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return getUserBySession(token);
}
