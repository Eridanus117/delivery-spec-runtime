---
id: INT-20260830-002
status: captured
area: governance
source: current-user-session
capturedAt: 2026-08-30
issue: null
promotedTo: null
---

# 根据风险选择 Change 工作流

## 原始问题

文档整理使用了与 Runtime 行为、安全合同和版本升级相同的完整 delivery-change，流程成本明显高于变更风险。

## 观察

- README 重组产生的生命周期和归档材料多于核心文档实现文件。
- Proposal、Decision、Review、Acceptance、Readiness 和 Archive 对高风险代码合理，但对纯文档表达修改可能过重。
- 统一重流程会延迟读者反馈，并促使实现优先满足门禁而不是验证文档质量。

## 影响

小型或低风险改动的交付时间增加；维护者可能绕过流程，或者让流程本身成为主要工作。

## 当前任务边界

本次只记录问题，不修改 `delivery-change` schema、机器合同或 Runtime Commands。

## 当前处置

继续使用现有仓库能力完成当前文档修复；后续统一 triage。

## 后续候选

- 快速文档修改：修改、聚焦检查、PR。
- 文档结构修改：读者目标、reader walkthrough、链接/命令检查、PR。
- 行为、合同、安全和升级：完整 delivery-change。
- 工作中发现高风险时只允许升级流程档位，不允许为绕过失败而降级。

## 证据

- `openspec/changes/archive/2026-08-30-reorganize-runtime-documentation/`
- 当前用户会话
