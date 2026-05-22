import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/session";
import { createProject, listProjects } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json({ projects: listProjects(user.id) });
}

export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: { title?: string; scenarioId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const title = (body.title ?? "").trim();
  const scenarioId = (body.scenarioId ?? "").trim();
  if (!title || !scenarioId) {
    return NextResponse.json(
      { error: "缺少 title 或 scenarioId" },
      { status: 400 }
    );
  }
  return NextResponse.json({
    project: createProject(user.id, title, scenarioId),
  });
}
