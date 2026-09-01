---
schemaVersion: 1
id: INT-20260830-002-change-profile-routing
state: promoted
phase: disposition
source: current-user-session
capturedAt: 2026-08-30
promotedTo: enforce-analysis-line-and-prune-pipeline
---

# 根据风险选择 Change 工作流

## 原始问题

文档整理使用了与 Runtime 行为、安全合同和版本升级相同的完整 delivery-change，流程成本明显高于变更风险。

## Triage

范围：不同风险和变更类型是否应选择不同的 Change 工作流。
影响：小型或低风险改动的交付时间增加，维护者可能绕过流程或让流程本身成为主要工作。
判断：continue

## Evidence

### 已知事实

- README 重组产生的生命周期和归档材料多于核心文档实现文件。
- Proposal、Decision、Review、Acceptance、Readiness 和 Archive 对高风险代码合理，但对纯文档表达修改可能过重。
- 统一重流程会延迟读者反馈，并促使实现优先满足门禁而不是验证文档质量。

- 2026-08-31 补充（3 事项复盘取证）：hold 时等待的「Workflow execution 真实运行数据」**至今为零**——`INT-20260831-019` 用 git 全历史检索证实本仓从未提交过任何 `workflow-binding.json`，分析线三单零执行。维护者裁定该零执行是对齐失败而非站位冗余，方向改为「先强制、后评判」。据此，本条目原先的等待条件永远不会自行满足：低风险变更之所以走重流程，正是因为「哪类走哪条线」从未被立法，agent 只能一律套用最重的一条。路由裁决与分析线的强制豁免规则是同一件事的正反两面——「必须走分析线的事项」与「可走快车道豁免的事项」是一张表的两列，不能分开立法，否则两处规则必然分叉。

### 未知与假设

- 不同风险档位的最小合同、升级条件和维护成本尚未形成正式比较。
- 当前没有证据证明某一种轻量流程可以覆盖所有低风险变更。
- 2026-08-31 修订：上面两条不再是 hold 的理由。档位比较可以在立法时以「默认重、例外轻、只许升档不许降档」的保守形态起步，无需先攒够数据；`light-change-v1.json`（intake/implementation/verification◆ 三站）已存在但从未被路由指派过任何事项，是现成的轻档位载体。

### 证据

- `openspec/changes/archive/2026-08-30-reorganize-runtime-documentation/`
- `openspec/specs/delivery-lifecycle-governance/`
- 当前用户会话
- 2026-08-31 追加：`openspec/intake/INT-20260831-019-three-item-retrospective.md`（3 事项复盘卷宗，含分析线零执行的硬证据与维护者逐条裁定）；`openspec/profiles/light-change-v1.json`（现成轻档位，零指派）。

## Options

### 候选处置

- 快速文档修改：修改、聚焦检查、PR。
- 文档结构修改：读者目标、reader walkthrough、链接/命令检查、PR。
- 行为、合同、安全和升级：完整 delivery-change。
- 工作中发现高风险时只允许升级流程档位，不允许为绕过失败而降级。
- 2026-08-31 追加候选：把「路由表」与「分析线豁免表」合并为**同一张表**——每类事项一行，声明它走哪条交付档位、是否必须先走分析线；由立项门 fail-closed 读取。

## Disposition

决定：解除 hold，提上日程，随 3 事项复盘一并立法。

理由：2026-08-31 维护者在 3 事项复盘中裁定——分析线的立项门改为 fail-closed 强制，而强制必然要求同时定义豁免（否则每一条 README 错别字修复都要跑一遍完整分析线）。「哪类事项必须走分析线、哪类走快车道豁免」与本条目要解决的「按风险选择 Change 档位」是同一张路由表，必须一并立法，分开立法必然分叉。原 hold 等待的「Workflow 真实运行数据」经复盘证实为零且不会自行产生，等待条件作废。

下一步：本条目 promote 至 Change `enforce-analysis-line-and-prune-pipeline`，路由表与豁免规则在该 Change 的方案与 spec delta 中落地；载体唯一，不另立 Change。

## History

- 2026-08-30T00:00:00.000Z legacy-normalized
- 2026-08-30T00:00:00.000Z held: await workflow evidence
- 2026-08-31T22:43:25.204Z advanced to triage
- 2026-08-31T22:43:25.687Z advanced to evidence
- 2026-08-31T22:43:26.174Z advanced to options
- 2026-08-31T22:43:26.690Z advanced to disposition
- 2026-08-31T22:45:35.997Z promoted to enforce-analysis-line-and-prune-pipeline
