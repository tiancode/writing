# Writing Agent

场景驱动的 AI 写作工具。一套场景定义（prompt + style + templates + form schema）同时驱动两个入口：

- **CLI** (`src/`)：基于 [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview)，agent 可用 Read/Write 工具产出多文件。适合本地开发者用。
- **Web UI** (`web/`)：Next.js 15，向导式界面 + 实时流式输出。基于 Anthropic Messages API，无文件系统副作用，适合多用户 SaaS 部署。**为非技术用户设计**。

支持场景：项目文档、投标文档、小说。新增场景只需在 `src/scenarios/` 下新建目录（含 `meta.json` + `form.json` + `prompts/` + `templates/` + `style.md`），CLI 和 Web 都会自动注册。

## 架构

```
用户需求
  │
  ▼
[Plan]   选模板 + 生成大纲 + 提澄清问题
  │
  ▼
[Draft]  按章节产出 Markdown 草稿
  │
  ▼
[Review] 一致性 / 完整性 / 风格自审 → 修订 + 审校笔记
  │
  ▼
最终文档
```

详见 [docs/architecture.md](./docs/architecture.md)。

## 安全与权限提示

- **路径沙箱（CLI）**：Agent 通过 `PreToolUse` hook 强制路径白名单：
  - **Write / Edit** 只能写 `--output` 指定的目录（默认 `./output/`）。
  - **Read / Glob / Grep** 默认也只能访问 outputDir，要读外部素材必须用
    `--input <path>` 明确白名单（可重复）。路径穿越 (`../`) 会在归一化后再校验，
    无法绕过。
- **`acceptEdits` + 沙箱组合**：拒绝路径外的写时 agent 会收到拒绝原因并自行调整，
  不需要人工介入；允许的路径写入则不弹确认。
- **已知边界**：沙箱不跟随符号链接（symlink 指向白名单外的文件，agent 仍能读到）。
  对高度敏感的环境，请同时用 OS 级容器/chroot 隔离。
- **Prompt 注入仍是真实风险**：`bid-doc` / `novel` 读取的外部素材若来源不可信，
  其内容可能影响 agent 行为（虽然不能写到 outputDir 外，但可能误导生成结果）。
  **请只对受信任的输入使用**。

## 快速开始

### Web UI（推荐 — 给最终用户用）

```bash
cd web
cp .env.example .env.local   # 填 ANTHROPIC_API_KEY
npm install
npm run dev
# 打开 http://localhost:3000
```

详见 [web/README.md](./web/README.md)。

### CLI（开发者本地用）

```bash
npm install
cp .env.example .env   # 填入 ANTHROPIC_API_KEY
```

```bash
npm run dev list                                       # 列出场景
npm run dev project-doc "为一个二手书交易小程序写一份 PRD"
npm run dev project-doc "设计文档：消息推送服务" --output ./drafts
```

CLI 默认输出到 `./output/`。Agent 的写操作被沙箱限定到该目录；
读外部文件需要用 `--input <path>` 显式允许（可重复）。

环境变量：

- `ANTHROPIC_API_KEY`（必需）— 从 `.env` 自动加载
- `ANTHROPIC_MODEL`（可选）— 覆盖默认模型，例如 `ANTHROPIC_MODEL=claude-opus-4-7 npm run dev project-doc "..."`

## 已支持场景

| 场景 ID        | 说明                                                          |
|----------------|---------------------------------------------------------------|
| `project-doc`  | 项目文档：PRD、技术设计、API 文档                             |
| `bid-doc`      | 投标文档：摘要、技术应答、商务应答、资质响应、偏离表          |
| `novel`        | 小说创作：大纲、人物卡、世界观、章节、增量摘要（长程一致性）  |

### 场景使用示例

```bash
# 项目文档
npm run dev project-doc "为一个二手书交易小程序写一份 PRD"

# 投标文档（外部招标文件用 --input 加入读取白名单）
npm run dev bid-doc "针对招标文件，生成技术应答" --input ./tender.md --input ./company-cases/

# 小说 — 首次启动（建立大纲、人物、世界观）
npm run dev novel "写一个赛博朋克题材的长篇，主角是底层数据修复工"

# 小说 — 继续写下一章
npm run dev novel "写第 3 章，主角与神秘客户首次接头" --output ./output
```

## 添加新场景

在 `src/scenarios/<your-scenario>/` 下创建：

```
your-scenario/
├── meta.json              # { "description": "..." }
├── form.json              # Web UI 表单 schema（CLI 忽略此文件）
├── prompts/
│   └── system.md          # 场景专属系统提示
├── templates/
│   └── *.md               # 文档模板
└── style.md               # 风格规范
```

CLI (`src/scenarios/registry.ts`) 和 Web (`web/lib/scenarios.ts`) 都会自动扫描注册，无需改 TypeScript 代码。`form.json` 是 Web UI 必需，缺失则该场景不会出现在网页首页（CLI 仍可用）。

## 目录结构

```
.
├── src/                          # CLI (Claude Agent SDK)
│   ├── index.ts                  # CLI 入口
│   ├── agent.ts                  # 三层流程编排
│   └── scenarios/
│       ├── registry.ts           # 场景自动注册
│       └── <id>/                 # 各场景定义
│           ├── meta.json
│           ├── form.json         # Web UI 表单 schema
│           ├── prompts/
│           ├── templates/
│           └── style.md
├── web/                          # Web UI (Next.js + Anthropic Messages API)
│   ├── app/                      # 页面 + API routes
│   ├── lib/scenarios.ts          # 共享场景加载
│   └── README.md
├── docs/architecture.md
└── package.json                  # CLI 包
```
