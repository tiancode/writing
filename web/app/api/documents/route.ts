import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/session";
import {
  createDocument,
  ensureDefaultProject,
  getProject,
  listDocuments,
} from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CONTENT_CHARS = 200_000;

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json({ documents: listDocuments(user.id) });
}

export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: {
    projectId?: string;
    scenarioId?: string;
    title?: string;
    content?: string;
    formData?: Record<string, string>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const scenarioId = (body.scenarioId ?? "").trim();
  const title = (body.title ?? "").trim() || "未命名文档";
  const content = body.content ?? "";
  if (!scenarioId) {
    return NextResponse.json({ error: "缺少 scenarioId" }, { status: 400 });
  }
  if (!content.trim()) {
    return NextResponse.json({ error: "文档内容为空" }, { status: 400 });
  }
  if (content.length > MAX_CONTENT_CHARS) {
    return NextResponse.json(
      { error: `文档过长（上限 ${MAX_CONTENT_CHARS} 字符）` },
      { status: 413 }
    );
  }

  let projectId = (body.projectId ?? "").trim();
  if (projectId) {
    const project = getProject(projectId, user.id);
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
  } else {
    projectId = ensureDefaultProject(user.id, scenarioId).id;
  }

  const doc = createDocument({
    projectId,
    userId: user.id,
    title,
    scenarioId,
    content,
    formData: body.formData,
  });
  return NextResponse.json({ document: doc });
}
