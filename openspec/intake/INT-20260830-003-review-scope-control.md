---
schemaVersion: 1
id: INT-20260830-003-review-scope-control
state: captured
phase: capture
source: current-user-session
capturedAt: 2026-08-30
promotedTo: null
---

# 控制 Review 视角、范围和重复执行

## 原始问题

文档变更的 fresh reviewer 被要求完整反查源码、历史文档和全部机器合同，单轮耗时过长；修复后又因 reviewed path 变化持续触发重复 Review。

## Triage

范围：Review 视角、审查范围、停止条件和重新 Review 的触发规则。
影响：Review 延迟交付，并把低风险文档修改按高风险实现处理；同时仍可能错过真正的可读性问题。
判断：continue

## Evidence

### 已知事实

- Reviewer 成功发现了命令顺序、软链参数和 public candidate 等准确性问题。
- Reviewer 的主要视角是 Contract Review，没有优先评价首次读者体验。
- 高强度、开放范围的任务缺少明确停止条件，调查持续扩展。
- LOW 的机械测试修复也准备重新执行完整 fresh review。
- 维护者已取消不必要的额外 Review；当前 README 使用直接 reader walkthrough 和聚焦合同测试验证。

### 新增观察（2026-08-30）

维护者反馈：原始审阅材料虽然包含完整技术定义，但不容易直接理解；改用“先讲目的、再给具体例子、最后列出需要确认的少数判断”的结构后，审阅明显更容易。说明 Review scope 不只是控制阅读范围，也需要控制表达层级和认知负担。

### 后续候选补充

- 每份需要维护者审阅的材料先提供平语摘要、一个具体运行例子和明确的确认问题；
- 技术字段、合同细节和历史证据放在后面作为可选依据，不作为第一阅读入口；
- 对需要多个文件支撑的事项提供单一审阅入口，明确哪些文件无需阅读。

### 未知与假设

- Reader Review 与 Contract Review 的最小输入、停止条件和重新执行阈值尚未正式合同化。

### 证据

- `openspec/changes/archive/2026-08-30-reorganize-runtime-documentation/implementation-review.json`
- 当前用户会话

## Options

### 候选处置

- 明确 Reader Review 与 Contract Review 两种视角。
- Reviewer 输入必须包含范围和停止条件。
- 根据 finding severity 和修复类型决定是否需要重新 fresh review。
- 保留高风险代码“任一受审路径变化即 stale”的严格规则。

## Disposition

决定：hold
理由：当前问题仍有价值，但应在 Workflow execution 运行闭环稳定后，以真实 Review 运行证据确定最小停止条件。
下一步：先完成 Workflow execution 和 Intake inventory，再重新 triage Review scope。

## History

- 2026-08-30T00:00:00.000Z legacy-normalized
- 2026-08-30T00:00:00.000Z held: await workflow evidence
