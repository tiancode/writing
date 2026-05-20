# Writing Agent

场景驱动的 AI 写作 agent，基于 [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview) 构建。

支持：项目文档（已实现）、投标文档（规划中）、小说（规划中）。新增文体场景只需新增一个目录，不改主干代码。

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

## 快速开始

```bash
npm install
cp .env.example .env   # 填入 ANTHROPIC_API_KEY
```

```bash
# 列出可用场景
npm run dev list

# 生成一份 PRD
npm run dev project-doc "为一个二手书交易小程序写一份 PRD"

# 指定输出目录
npm run dev project-doc "设计文档：消息推送服务" --output ./drafts
```

输出默认写入 `./output/`。

## 已支持场景

| 场景 ID        | 说明                                |
|----------------|-------------------------------------|
| `project-doc`  | 项目文档：PRD、技术设计、API 文档   |

## 添加新场景

在 `src/scenarios/<your-scenario>/` 下创建：

```
your-scenario/
├── meta.json              # { "description": "..." }
├── prompts/
│   └── system.md          # 场景专属系统提示
├── templates/
│   └── *.md               # 文档模板
└── style.md               # 风格规范
```

`registry.ts` 会在启动时自动扫描注册，无需改 TypeScript 代码。

## 目录结构

```
.
├── src/
│   ├── index.ts                  # CLI 入口
│   ├── agent.ts                  # 三层流程编排
│   └── scenarios/
│       ├── registry.ts           # 场景自动注册
│       └── project-doc/          # 第一个场景
├── docs/architecture.md
└── package.json
```
