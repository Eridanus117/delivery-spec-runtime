---
schemaVersion: 1
id: INT-20260901-020-approval-model-station-model-fork
state: captured
phase: capture
source: enforce-analysis-line-implementation
capturedAt: 2026-09-01
promotedTo: null
---

# Intake

## 原始问题

批准模型（artifact-approvals）与站位模型（delivery-change-v1.json 的 humanJudgment）在同一条交付线上各自定义了「哪里需要人表态」，两者互不引用，出现第三处两侧分叉。

发现经过：实施 enforce-analysis-line-and-prune-pipeline 时转录维护者门口表态，转录完 01-05 七份工件后 guard apply 仍非零，报 test-plan 批准状态为 pending。追查 delivery-control.ts 得知 requiredBeforeAcceptance 取 artifactPaths 的全部键，apply 分支对全部 9 份工件逐项 requireApproved。

分叉事实：
1. artifact-approvals 要求 9 份工件（raw-requirements、specs、business-current、technical-current、solution-proposal、solution-decision、change-plan、test-plan、tasks）全部持人工批准记录才放行 apply。
2. delivery-change-v1.json 中 implementation 站（其 requiredInputs 即 tasks）的 humanJudgment 为 false，即站位模型认定 tasks 是机器站。
3. 06-测试方案 在交付 7 站里根本没有对应站位，却同样被批准模型索取人工表态。

即：站位模型判为机器站、乃至判为不存在的工件，批准模型仍在索取人工表态。这与本 Change 任务 1.3/1.4 的一致性合同测试要锁定的是同一类两侧分叉（A6 结构债），只是分叉发生在 artifact-approvals 维度而非 humanJudgment 维度，因而不被 station-authority 探针覆盖——探针只比对 profile 与真门禁的表态索取行为，不比对批准清单。

维护者裁定（2026-09-01 主会话门口）：本单不吸收，避免扩范围。留待强制版分析线跑满 2 单后的复盘一并裁——届时与 A1 的留/修/杀、以及本条一并判断「人工表态点」的唯一权威定义应落在哪一侧。

## Triage

范围：
影响：
判断：

## Evidence

### 已知事实

### 未知与假设

### 证据

## Options

### 候选处置

## Disposition

决定：
理由：
下一步：

## History

- 2026-09-01T01:15:51.528Z captured
