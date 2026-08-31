---
schemaVersion: 1
id: INT-20260831-008-claude-code-deployment-gap
state: triaged
phase: options
source: maintainer-session
capturedAt: 2026-08-31
promotedTo: null
---

# Intake

## 原始问题

维护者发现：/opsx-* 工作流命令只渲染并软链到 .omp/commands，仅 OMP 可用；Claude Code CLI（.claude/commands 或 skills 机制）没有任何部署，消费仓中的 Claude Code 会话看不到工作流命令，只能靠 agent 自行调用 runtime-entry.ts 底层 CLI。是否以及如何为 Claude Code 部署，待定。

## Triage

范围：Runtime 命令资产的部署目标覆盖面（当前仅 OMP）；`runtime-manifest.json` 受管软链清单；`render-commands.ts` 渲染目标。不含命令正文内容本身。
影响：Claude Code 是维护者实际使用的 agent 载体之一；缺少部署意味着该载体下工作流不可发现，依赖 agent 的先验知识，接入体验不一致。
判断：continue

## Evidence

### 已知事实

- `runtime-manifest.json` 的 `submodule.links` 只有三条：`.omp/commands`、`openspec/schemas/delivery-change`、`openspec/tools/runtime-entry.ts`；无任何 Claude Code 目标。
- 仓库全文 grep 无 "claude" 字样；无 `.claude/` 目录。
- `render-commands.ts` 渲染目标硬编码为 `.omp/commands/opsx-*.md`（preamble + body 拼接的纯 Markdown）。
- Claude Code 的项目级斜杠命令机制同为目录下的 Markdown 文件（`.claude/commands/*.md`），另有 skills 机制（`.claude/skills/`）可承载带触发说明的流程；渲染产物形态上接近，复用或二次渲染在工程上均可行。
- 2026-08-31 会话实证：Claude Code 会话无命令可用时，agent 直接调用 `runtime-entry.ts` 底层 CLI 亦可完整驱动 workflow（bind/run/intake 全流程跑通）。

### 未知与假设

- 部署形态未定：第四条受管软链复用同一渲染产物、独立渲染 Claude 专用格式（含 frontmatter/allowed-tools）、还是 skill 形态。
- 与 INT-007 的方向交互：维护者痛点含「命令记忆负担」，为第二个载体铺更多斜杠命令是否正确方向，或应偏向 agent 指引（CLAUDE.md/AGENTS.md 指路 + agent 代驾底层 CLI）。
- OMP 与 Claude Code 双载体长期并存还是有主次，影响投入优先级。

### 证据

- `runtime-manifest.json`；`openspec/tools/render-commands.ts`；仓库 grep 结果。
- 2026-08-31 维护会话（Claude Code 直接驱动底层 CLI 的实测）。

## Options

### 候选处置

- 最小部署：manifest 增加第四条受管软链 `.claude/commands` 指向同一渲染产物目录，零新渲染逻辑；需评估 runtime-check、runtime-link 合同与既有消费仓的兼容影响。
- 独立渲染目标：render-commands 增加 Claude 专用输出（可带 frontmatter），投入更大，格式更地道。
- 不部署命令，改走 agent 指引：在消费仓接入文档/AGENTS.md 中写明底层 CLI 入口，由 agent 代驾（与 INT-007 零命令化方向一致）。
- 维持现状，待 INT-007 方向定夺后一并处理。

## Disposition

决定：
理由：
下一步：

## History

- 2026-08-31T17:15:41.250Z captured
- 2026-08-31T17:16:10.667Z advanced to triage
- 2026-08-31T17:16:11.158Z advanced to evidence
- 2026-08-31T17:16:11.614Z advanced to options
