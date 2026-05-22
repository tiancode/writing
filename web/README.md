# Writing Agent — Web UI

向导式写作助手前端。基于 Next.js 15 + React 19 + Tailwind 4 + Anthropic Messages API。

## 设计原则

为非技术用户设计：
- **场景卡片** 而不是空白输入框 — 用户先选"我要写什么"
- **结构化表单** 而不是 chat — 字段引导用户提供必要信息
- **实时流式输出** — 边生成边显示，让用户看到进度
- **一键下载** — 不让用户折腾导出
- **分段改写** — 鼠标移到任意段落点"改写"，只重写该段，无需重生成整篇
- **账号 + 文档库** — 注册登录后可保存 / 重新打开 / 继续编辑文档
- **额度计费** — 按 token 折算额度，登录用户按额度使用（替代匿名的 IP 限流）

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

### 环境变量

- `ANTHROPIC_API_KEY`（必需）— 服务器端调用 Anthropic
- `ANTHROPIC_MODEL`（可选）— 覆盖每个场景的默认模型
- `DATABASE_PATH`（可选）— SQLite 文件路径，默认 `web/data/app.db`；设为 `:memory:` 用临时库（测试用）

数据库使用 Node 22 自带的 `node:sqlite`（实验特性），**无需安装原生依赖**，首次运行自动建表。`data/` 目录已被 gitignore。

### 账号 / 文档 / 额度的数据模型

```
users(id, email, password_hash, credits)   # 密码用 scrypt 加盐哈希（node:crypto）
sessions(token, user_id, expires_at)        # httpOnly Cookie 会话，30 天
projects(id, user_id, title, scenario_id)
documents(id, project_id, user_id, title, content, form_data)
usage_events(...)                           # 每次调用的 token 与额度流水
```

- 匿名用户：保留原有的单 IP 限流，不能保存文档。
- 登录用户：跳过 IP 限流，改为额度计费（`lib/billing.ts` 里 `creditsForUsage` 折算，输出 token 权重高于输入，缓存命中近乎免费），生成完成后从余额扣除并记一条 `usage_events`。
- 分段改写复用 `/api/generate` 的 `rewrite` 形态，登录与匿名都可用。

## 部署建议

- 推荐 Node 长进程平台：Railway / Fly.io / Render
- Vercel 也可，但 `/api/generate` 是流式响应，需用 Node runtime 不是 Edge；
  且无服务器文件系统不适合 SQLite —— 多实例 / serverless 部署请替换持久层（见下）
- API key 放服务器环境变量；用户**不需要**也**不应该**接触
- `DATABASE_PATH` 指向持久卷，否则容器重启会丢数据
- 反向代理（Nginx / Cloudflare）做 SSE keep-alive 配置

### 从自包含栈升级到生产栈

当前实现刻意做成**自包含、可在单机/沙箱直接跑通**的形态，升级路径已留好接口：

| 关注点 | 当前（自包含） | 升级到生产 |
| --- | --- | --- |
| 数据库 | `node:sqlite` 单文件（`lib/db.ts`） | 换成 Postgres：只需替换 `lib/db.ts` 暴露的 SQL 句柄，repository/auth 层不变 |
| 鉴权 | 邮箱+密码（scrypt）+ Cookie 会话（`lib/auth.ts`） | 接 Auth.js / OAuth：替换 `createUser`/`authenticate`/会话发放 |
| 计费 | 内部积分台账（`lib/billing.ts` + `usage_events`） | 接 Stripe：`creditsForUsage` 保留为用量计量，把余额来源换成 Stripe 订阅 / 充值 webhook |
| 限流 | 单实例内存 Map（匿名）+ 额度（登录） | Redis 限流 + 边缘 WAF |

## 目录结构

```
web/
├── app/
│   ├── page.tsx                  # 首页：场景卡片
│   ├── [scenario]/
│   │   ├── page.tsx              # 场景页（server）
│   │   └── scenario-form.tsx     # 表单 + 流式输出 + 分段改写 + 保存（client）
│   ├── login/page.tsx            # 登录 / 注册
│   ├── projects/page.tsx         # 我的文档（列表 / 删除）
│   ├── documents/[id]/page.tsx   # 单文档编辑器
│   ├── api/
│   │   ├── generate/route.ts     # SSE 流式 API（生成 + rewrite 分段改写）
│   │   ├── auth/{register,login,logout,me}/route.ts
│   │   ├── projects/[...]         # 项目 CRUD
│   │   └── documents/[...]        # 文档 CRUD
│   ├── layout.tsx                # 头部含 AuthNav，包 AuthProvider
│   └── globals.css
├── lib/
│   ├── scenarios.ts              # 读 ../src/scenarios/ + 提示词拼装
│   ├── anthropic.ts              # Anthropic 客户端
│   ├── db.ts                     # node:sqlite 连接 + 建表
│   ├── auth.ts                   # 密码哈希 / 会话 / 用户
│   ├── repository.ts             # 项目 / 文档 / 额度数据访问
│   ├── billing.ts                # 额度折算（纯函数）
│   ├── session.ts                # 从请求 / Cookie 解析当前用户
│   ├── markdown-sections.ts      # 分段切分 / 回填（纯函数）
│   └── sse-client.ts             # 前端共享的 SSE 消费逻辑
├── components/
│   ├── MarkdownView.tsx
│   ├── SectionEditor.tsx         # 分段改写 UI（表单页与文档页复用）
│   ├── DocumentEditor.tsx        # 单文档编辑
│   ├── AuthForm.tsx / AuthNav.tsx
│   └── auth-context.tsx          # 客户端登录态 Context
└── package.json                  # 无新增依赖（sqlite / 哈希均用 Node 内置）
```

## Phase 2（已完成）

- ✅ 文档分段编辑器（鼠标移到段落 → "改写"，预设 更正式/更口语/扩充/精简 + 自定义指令）
- ✅ 多文档保存（SQLite：projects / documents），可重新打开继续编辑
- ✅ 用户账号 + 额度计费（注册登录、会话、按 token 折算额度、用量流水）

后续（生产化）：接 Postgres / Auth.js / Stripe，见上方「升级到生产栈」。

详见根 [docs/architecture.md](../docs/architecture.md)。
