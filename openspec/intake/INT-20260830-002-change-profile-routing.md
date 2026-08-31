---
schemaVersion: 1
id: INT-20260830-002-change-profile-routing
state: captured
phase: capture
source: current-user-session
capturedAt: 2026-08-30
promotedTo: null
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

### 未知与假设

- 不同风险档位的最小合同、升级条件和维护成本尚未形成正式比较。
- 当前没有证据证明某一种轻量流程可以覆盖所有低风险变更。

### 证据

- `openspec/changes/archive/2026-08-30-reorganize-runtime-documentation/`
- `openspec/specs/delivery-lifecycle-governance/`
- 当前用户会话

## Options

### 候选处置

- 快速文档修改：修改、聚焦检查、PR。
- 文档结构修改：读者目标、reader walkthrough、链接/命令检查、PR。
- 行为、合同、安全和升级：完整 delivery-change。
- 工作中发现高风险时只允许升级流程档位，不允许为绕过失败而降级。

## Disposition

决定：hold
理由：问题已被识别，但需要结合 Workflow execution 的真实运行数据再决定是否改变 Change 档位合同。
下一步：先完成最小 Workflow 闭环和 Intake inventory；积累一轮低频脱敏证据后重新 triage。

## History

- 2026-08-30T00:00:00.000Z legacy-normalized
- 2026-08-30T00:00:00.000Z held: await workflow evidence
