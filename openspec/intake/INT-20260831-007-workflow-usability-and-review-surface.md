---
schemaVersion: 1
id: INT-20260831-007-workflow-usability-and-review-surface
state: promoted
phase: disposition
source: maintainer-dogfooding-session
capturedAt: 2026-08-31
promotedTo: establish-human-interaction-layer
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

- 流水线形状本身是否过重（2026-08-31 维护者存疑）：17 个机器站位按审计理想设计，未经真实使用检验，可能含仪式性站位（产物无人读、门为橡皮图章）。处置：不做事前重设计；交互层落地后跑满 3 个真实事项，强制复盘逐站裁留/修/杀，按证据裁剪。交互合同（发起＋产物＋三动词）与站位数解耦，裁剪不影响人的界面。
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

设计澄清（2026-08-31）：九条 opsx 命令的分段粒度来自审计模型（段间有门，段须有硬边界与独立合同），作为机器分段并非误设计；误设的是「人为调用者」这一隐含假设。后续处置方向为重新归类（命令降为 agent 驱动的内部零件，人的界面另行设计），而非删除或重做命令集。

维护者补充观察（2026-08-31）：期望交互为单向流水线——一次显式发起，随后自动行进，仅在人工判断门停靠。据此四条路线可收敛为「一次发起 + 自动行进 + 门口停靠（一屏报告）+ 在途提醒（只提醒停在门口的在途事项，不主动开新事）」；单入口菜单不再必要，Claude Code 部署形态可收敛为单个 skill（识别发起与催进度意图、驱动底层 CLI、门口摆报告）。方向待维护者确认。

交互设计草案（2026-08-31，待维护者确认后转正式 Change）：
- 流水线五站：登记（intake）→ 分析（requirement-analysis profile）→ 规划 → 实施 → 验收·归档（后三站由 opsx 命令承载）。每站 agent 交付一个人可读产物；门仅设于分析、规划、验收三站。
- 人的完整词汇表：发起（一句话）＋门口三动词（同意/纠正/驳回）＋沉默=缓（在途提醒兜底）；任何时候可插话改道。同意=建，驳回=不建，纠正=继续分析，覆盖既有四分处置。
- 重量伸缩：小事合并或跳过分析/规划站，仅留验收门；重量由 agent 登记时建议、人于首个门认可。
- 既有资产全部保留并重新归类：intake CLI、workflow profile、九条 opsx 命令为 agent 内部零件；人的界面由 Claude Code skill 承载。

2026-08-31 维护者确认交互设计方向，并补充约束：同一时间仅一个事项在流水线上，切换事项须明确声明。人视五站为折叠视图，机器站位全景：登记 5（capture/triage/evidence/options/disposition）＋分析 5（capture/clarify↺/discover↺/evaluate↺/decision◆）＋交付 7（proposal/decision◆/implementation/review/acceptance◆/sync/archive◆）；快车道 light-change 3（intake/implementation/verification◆）；opsx-explore 为随时可用的只读侧路。折叠规则：人只见三门（立项=RA decision、方案=DC decision、验收=DC acceptance，验收之同意授权 archive 的机械确认）；RA 各阶段人工判断由「纠正=再走一轮」承载。后续以正式 Change 落地。

## Disposition

决定：promote
理由：维护者已确认交互设计方向（单向流水线、三门、三动词、单事项在线）并批准按「先交互层、后流程瘦身检查点」顺序立项。
下一步：由 Change `establish-human-interaction-layer` 交付人机交互层；流水线形状之疑保留在本条目未知节，3 事项复盘检查点触发时评估。缺陷级小刺（DEP0190、run 入口语义）不入本 Change，留待后续顺手处理。

## History

- 2026-08-31T17:09:23.727Z captured
- 2026-08-31T17:09:57.932Z advanced to triage
- 2026-08-31T17:09:58.425Z advanced to evidence
- 2026-08-31T17:09:58.872Z advanced to options
- 2026-08-31T17:55:26.443Z advanced to disposition
- 2026-08-31T17:55:38.047Z promoted to establish-human-interaction-layer
