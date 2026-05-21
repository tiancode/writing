# 架构说明

## 设计目标

1. **灵活**：新增文体场景（投标、营销文案、小说……）只需新增一个目录，不改主干代码。
2. **可控**：明确的"规划 → 写作 → 审校"三段式，便于在每段人工干预。
3. **可追溯**：模板 + 风格规范以 Markdown 形式版本管理，文档质量演进可追溯。
4. **多入口**：同一套场景定义同时驱动 CLI（开发者）和 Web UI（终端用户）。

## 两个运行入口

| 入口 | 路径 | 引擎 | 特征 |
| --- | --- | --- | --- |
| CLI | `src/` | `@anthropic-ai/claude-agent-sdk` | Agent 可用 Read/Write/Edit/Glob/Grep 工具，多文件落盘 |
| Web | `web/` | `@anthropic-ai/sdk`（Messages API） | SSE 流式，无文件系统副作用，支持续写（单文档多轮迭代）|

两个入口共享 `src/scenarios/<id>/` 下的 `system.md` + `style.md` + `templates/`。
Web 额外要求 `form.json`（描述表单字段）。Web 在拼接系统提示时追加
**"Web Mode Override"** 段，强制 agent 直接产出 Markdown 而非调用工具，
并跳过三段式中的 Plan 阶段（除非必须提澄清问题）。

## 三层流程

```
用户需求
   │
   ▼
[Plan]   选模板 + 生成大纲 + 提澄清问题
   │
   ▼
[Draft]  按章节产出 Markdown 草稿（Write 工具落盘）
   │
   ▼
[Review] 一致性 / 完整性 / 风格自审 → 修订 (Edit) → 输出审校笔记
   │
   ▼
最终文档 + Review Notes
```

### Plan 规划层
- 输入：用户的自然语言需求
- 输出：选定模板 + 章节级大纲 + 待澄清问题
- 关键：信息不足时必须先提问，不允许凭空补全 scope

### Draft 写作层
- 输入：大纲 + 模板 + 风格规范
- 输出：分章节 Markdown 草稿
- 设计要点：长文档可按章节分批写，避免一次性吞掉所有上下文

### Review 审校层
- 输入：完整草稿
- 输出：修订版 + 审校笔记（假设清单、待用户确认项、后续建议）

## 场景插件结构

```
src/scenarios/<id>/
├── meta.json         # { "description": "..." }
├── prompts/
│   └── system.md     # 场景专属系统提示（业务知识、写作偏好、流程）
├── templates/
│   └── *.md          # 文档模板（章节骨架）
└── style.md          # 风格规范（语气、用词、格式）
```

`src/scenarios/registry.ts` 启动时扫描该目录，所有包含 `meta.json` 的子目录
都会被自动注册为可用场景。**新增场景不需要修改任何 TypeScript 代码。**

## 后续扩展方向

### 投标文档（bid-doc）
- 新增工具：招标文件解析（pdf/docx → 应答点）
- 新增能力：资质库 RAG 检索（公司案例、人员证书、过往业绩）
- 新增模板：技术应答、商务应答、资质响应、偏离表

### 小说（novel）

已落地（CLI + Web 双入口）：
- 持久化状态：CLI 维护 `state/`（outline / worldview / characters / chapter-summaries / glossary）。Web 无文件系统，通过表单粘贴上下文。
- 章节模式强制流程：连续性预检（preflight）→ 章节大纲 → 草稿 → 一致性自审（用 `consistency-check.md` 模板）→ 回写 state。
- 独立的 **Summary 模式**：给定章节正文，产出一条结构化摘要（CLI 追加到 `chapter-summaries.md`；Web 直接返回）。
- 独立的 **Check 模式**：给定章节草稿 + 对照素材，按 `consistency-check.md` 模板逐项审计（时间线 / 人物 / 视角 / 设定 / 伏笔 / 风格漂移 / 修订优先级）。

后续可继续扩展：
- 自动跨章扫描悬空伏笔（CLI 可基于 `state/chapter-summaries.md` 的 `<SEED>` / `<PAYOFF>` 标注做静态分析）
- 多 agent 拆分：让 review agent 独立 LLM 调用，避免"自审 = 自欺欺人"

### 长文档记忆与 RAG（横向能力）
- 用户素材库（历史文档、行业模板）向量检索
- 文档长度超过上下文窗口时，自动摘要并维护"已写内容索引"

## 何时升级架构

当前 MVP 用单个 `query()` 驱动整个三阶段流程。出现以下信号时再拆分为多 agent：

- 写作层需要并行处理 >5 个章节（用 `Task` 子 agent 并行）
- 审校层需要独立的 LLM 调用以避免"自欺欺人"（独立 review agent）
- 场景内部存在显著异构的子任务（如投标的"资质匹配"vs"技术应答"）

## CLI 沙箱模型

CLI 的 `query()` 使用 `cwd: <outputDir>` + `permissionMode: "acceptEdits"`
+ `hooks.PreToolUse: [pathGuard]`（见 `src/sandbox.ts`）。规则：

| 工具 | 允许路径 |
| --- | --- |
| Write / Edit / NotebookEdit | 只能在 `outputDir` 内 |
| Read / Glob / Grep | `outputDir` ∪ 所有 `--input <path>` |

实现细节：

- `PreToolUse` hook 在 SDK subprocess 发起任何工具调用之前同步触发，
  与 `permissionMode` 无关（即使 acceptEdits 也会经过 hook）。
- 拒绝时返回 `{ permissionDecision: "deny", permissionDecisionReason: "..." }`，
  agent 收到具体原因后会自行调整 — 不需要人工介入。
- 所有路径经 `path.resolve()` 归一化后比对，`../` 穿越在校验前已被消除。
- **不**跟随符号链接。outputDir 里的 symlink 若指向外部文件，仍可被读到。
  hostile input 场景需要 OS 级容器或 chroot。

### `--input` 使用约定

- 可重复：`--input ./a --input /abs/b/`
- 给 agent 的系统提示里会自动加一段 "Reference Materials (read-only)" 列出
  这些路径，模型能感知到它们存在。
- 任何 `--input` 路径都是**只读**：Write/Edit 仍只能落在 outputDir。

## Web 输入 / 速率限制

`web/app/api/generate/route.ts` 包含三层保护，仅适合单实例部署：

- 单 IP 每小时请求数上限（内存桶，进程重启即清空）
- 单次请求总字符上限（formData + 续写历史）
- 单会话续写轮数上限

生产环境多实例部署应替换为 Redis 限流 + 边缘 WAF。
