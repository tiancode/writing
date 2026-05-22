import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/session";
import { deleteProject } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const ok = deleteProject(id, user.id);
  if (!ok) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
