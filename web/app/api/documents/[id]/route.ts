import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/session";
import {
  deleteDocument,
  getDocument,
  updateDocument,
} from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CONTENT_CHARS = 200_000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const doc = getDocument(id, user.id);
  if (!doc) return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  return NextResponse.json({ document: doc });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  let body: { title?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  if (body.content !== undefined && body.content.length > MAX_CONTENT_CHARS) {
    return NextResponse.json(
      { error: `文档过长（上限 ${MAX_CONTENT_CHARS} 字符）` },
      { status: 413 }
    );
  }

  const doc = updateDocument(id, user.id, {
    title: body.title?.trim() || undefined,
    content: body.content,
  });
  if (!doc) return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  return NextResponse.json({ document: doc });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const ok = deleteDocument(id, user.id);
  if (!ok) return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
