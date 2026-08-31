---
schemaVersion: 1
id: INT-20260830-006-requirement-consultation-boundary
state: triaged
phase: triage
source: current-runtime-maintenance-session
capturedAt: 2026-08-30
promotedTo: null
---

# 需求咨询与实施边界

## 原始问题

用户询问：一个需求进入后应如何处理，需求分析是否需要做，以及分析应放在 Change 内还是 Change 外。

## Triage

范围：Runtime 项目的需求入口、流程咨询和实施请求之间的确认边界。
影响：如果把流程咨询误判为实施请求，Agent 可能扩大 Change 范围和时间成本。
判断：continue

## Evidence

### 已知事实

- 该问题本身是流程咨询，不包含明确的代码实施请求。
- 相关工作实际包含 Runtime 自托管 OpenSpec 流程、多 Workflow Profile contracts/core/CLI、测试、文档、Acceptance、Spec Sync 和 Archive。
- 最终实现已通过验证并归档，但实际工作范围明显大于回答流程边界所需的最小范围。
- Runtime 需要在流程咨询与明确实施意图之间保留确认点。

### 未知与假设

- 未来是否由命令或 Workflow 提供独立的实施意图确认门，尚未决定。

### 证据

- `openspec/changes/archive/2026-08-30-establish-workflow-multi-profile-v01/`
- 当前 Runtime 维护会话

## Options

### 候选处置

- 流程咨询先输出基于证据的现状、边界和建议；只有维护者明确要求落地或确认实施范围后，才创建或修改 Change。
- 在 `/opsx-new` 或统一入口中增加显式的实施意图确认约束，但不得把聊天确认伪造为机器审批。
- 若要改变命令行为，另立独立 Change，评估对现有 Runtime 使用者的影响。

## 当前处置

- 已识别并确认根因：将流程咨询误判为实施请求。
- 后续默认行为：流程咨询先输出现状、边界和建议；只有用户明确要求落地或明确确认实施范围后，才创建或修改 Change。
- 进入实施前先确认最小交付范围；实施后再按正式 Change 生命周期执行。
- 当前保持 `triaged`，作为后续流程改进的入口。

## Disposition

决定：
理由：
下一步：

## History

- 2026-08-30T00:00:00.000Z legacy-normalized
