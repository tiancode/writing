# Writing Agent — Web UI

向导式写作助手前端。基于 Next.js 15 + React 19 + Tailwind 4 + Anthropic Messages API。

## 设计原则

为非技术用户设计：
- **场景卡片** 而不是空白输入框 — 用户先选"我要写什么"
- **结构化表单** 而不是 chat — 字段引导用户提供必要信息
- **实时流式输出** — 边生成边显示，让用户看到进度
- **一键下载** — 不让用户折腾导出

## 与后端共享什么

复用根目录 `../src/scenarios/` 下的全部 prompt、style guide、templates。每个场景多了一个 `form.json` 描述表单字段（CLI 忽略它）。

Web 端用 Anthropic Messages API 直接调用，**不走** Claude Agent SDK（无文件系统副作用，适合多用户 SaaS）。系统提示自动 append 一段 "Web Mode Override" 禁止 agent 提及工具调用。

## 本地开发

```bash
# 在 web/ 目录下
cp .env.example .env.local   # 填 ANTHROPIC_API_KEY
npm install
npm run dev
# 打开 http://localhost:3000
```

## 部署建议

- 推荐 Node 长进程平台：Railway / Fly.io / Render
- Vercel 也可，但 `/api/generate` 是流式响应，需用 Node runtime 不是 Edge
- API key 放服务器环境变量；用户**不需要**也**不应该**接触
- 生产环境建议加：
  - 简单的 session/cookie 限流（每 IP / 每会话每天 N 次）
  - usage 日志（按 scenarioId 聚合 token 消耗）
  - 反向代理（Nginx / Cloudflare）做 SSE keep-alive 配置

## 目录结构

```
web/
├── app/
│   ├── page.tsx                  # 首页：场景卡片
│   ├── [scenario]/
│   │   ├── page.tsx              # 场景页（server）
│   │   └── scenario-form.tsx     # 表单 + 流式输出（client）
│   ├── api/generate/route.ts     # SSE 流式 API
│   ├── layout.tsx
│   └── globals.css
├── lib/
│   ├── scenarios.ts              # 读 ../src/scenarios/
│   └── anthropic.ts              # Anthropic 客户端
├── components/
│   └── MarkdownView.tsx
└── package.json
```

## Phase 2（待做）

- 文档分章节编辑器（点选章节 → 右侧面板"重写更正式""扩充案例"）
- 多文档项目状态保存（数据库）
- 用户账号 / 计费

详见根 [docs/architecture.md](../docs/architecture.md)。
