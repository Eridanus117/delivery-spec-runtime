---
schemaVersion: 1
id: INT-20260831-007-workflow-usability-and-review-surface
state: triaged
phase: options
source: maintainer-dogfooding-session
capturedAt: 2026-08-31
promotedTo: null
---

# Intake

## 原始问题

requirement-analysis profile 首次真实使用后，维护者反馈使用体验问题：审阅负担、命令记忆负担；同时实测发现两处缺陷级问题（DEP0190 警告噪音、两个 run 入口推进语义不一致）。是否以及如何优化使用体验、是否与 opsx 命令体系整合，待定。

## Triage

范围：requirement-analysis profile 的调用体验（CLI 层）、workflow 结果的人工审阅界面、与 /opsx-* 命令体系的整合边界。不含三个分析阶段的内容合同本身。
影响：使用成本影响 profile 被真实采用的频率；两处缺陷级问题影响输出整洁性和入口一致性，但不影响合同正确性。
判断：continue

## Evidence

### 已知事实

- profile 功能上完整可用：2026-08-31 dogfooding 实测跑通 bind → capture → clarify → 多轮 continue-analysis 循环，fail-closed 与人工判断门均按 spec 生效。
- 缺陷一：`runtime-entry.ts:154` 每次 workflow 子命令都以 `shell: true` 探测 `openspec --version`，Node 24 下产生 `DEP0190` 弃用警告，混入本应干净的 JSON 输出。
- 缺陷二：两个 run 入口推进语义不一致——`workflow-entry.ts run --input`（单机模式）经 `executeUntilAttentionGate` 自动推进到下一个关注门；`workflow run --change-root`（绑定模式，经 workflow-control.ts）一次只执行一步，输入齐备时也需反复调用并由调用方手抄 `completedStages`。
- 调用方需手工维护状态机：`completedStages` 从 result 回抄 request、request 单文件累积增长、无 request 骨架生成命令，`inputContracts` 只能从 `describe` 的 JSON 输出中人工提取。
- 人工审阅负担：workflow 的 request/result JSON 是机器侧资产，直接作为审阅材料摆给人时成本过高；维护者反馈审阅过程和命令记忆是主要使用负担。
- 命令渲染管线（`.omp/command-sources/manifest.json` + bodies + `render-commands.ts`）现成，新增 opsx 命令承载分析工作流在工程上可行。
- docs 三篇共 12 处覆盖 workflow 基本用法，但无一页式「跑一轮分析」操作手册。

### 未知与假设

- 真实使用频率：本次是 profile 建成后第一次真实使用，无历史频次数据。
- 消费对象：实际操作 JSON 状态机的是 agent 还是人，决定优化的优先级和方向。
- 若走 opsx 整合方向，与 INT-20260830-006（咨询/实施边界）的交互设计未定。

### 证据

- `openspec/tools/runtime-entry.ts`、`workflow-entry.ts`、`workflow-control.ts` 源码。
- 2026-08-31 维护会话的 CLI 实测记录（bind/run 各阶段退出码与输出）。
- `docs/` grep 结果；`.omp/command-sources/` 目录结构。

## Options

### 候选处置

- 缺陷级小修（独立成立，不依赖方向决策）：消除 DEP0190 警告噪音；统一或明确文档化两个 run 入口的推进语义；补一页操作手册。light-change 级投入。
- 人审摘要层：workflow 结果除机器 JSON 外输出一份人可读的简短摘要（当前阶段、待判断项、下一步），降低审阅成本。是否由 Runtime 承载待定，也可先由调用方约定解决。
- CLI 便利层（`workflow init`/`next`：按 inputContracts 生成 request 骨架、自动回填 completedStages）：降低手工状态机成本，但便利层不得代填 judgments，且使用频率未证实前有过早优化风险。
- 渲染 `/opsx-analyze` 命令整合进 OMP 命令体系：整合收益最大，投入最大，依赖 INT-006 边界设计；在使用频率未证实前暂不推进。

### 使用路线候选（2026-08-31 补充，与 INT-20260831-008 联动）

维护者核心约束：人侧记忆负担为零或近零。四个候选路线（可组合）：

1. 说话优先（agent 代驾）：人用自然语言表达意图；agent 依仓库渲染的指路资产（Claude Code 为 skill，另有接入文档条目）驱动底层 CLI。优：记忆负担零、跨载体一致；劣：依赖 agent 在场与意图识别，可发现性差（人不提就不出现）。
2. 单一入口命令：只部署一条命令，敲入后由 agent 按当前状态列出可做之事引导。优：只记一个词、可发现性好、实施小；劣：仍有一词记忆负担，交互多一跳，双载体各需一份入口。
3. 全命令对齐：为 Claude Code 部署整套 /opsx-*。优：与 OMP 一致、老练用户直达、复用渲染产物；劣：人侧记忆负担最大，与维护者反馈的痛点直接冲突。
4. 状态驱动（系统主动）：agent 会话按约定主动扫描待办状态（停在门口的分析、待处置 intake），主动向人摆报告。优：连「想起系统存在」都不需要，门口的事不烂尾；劣：打扰边界需设计，实施投入最大。

维护者补充观察（2026-08-31）：期望交互为单向流水线——一次显式发起，随后自动行进，仅在人工判断门停靠。据此四条路线可收敛为「一次发起 + 自动行进 + 门口停靠（一屏报告）+ 在途提醒（只提醒停在门口的在途事项，不主动开新事）」；单入口菜单不再必要，Claude Code 部署形态可收敛为单个 skill（识别发起与催进度意图、驱动底层 CLI、门口摆报告）。方向待维护者确认。

## Disposition

决定：
理由：
下一步：

## History

- 2026-08-31T17:09:23.727Z captured
- 2026-08-31T17:09:57.932Z advanced to triage
- 2026-08-31T17:09:58.425Z advanced to evidence
- 2026-08-31T17:09:58.872Z advanced to options
