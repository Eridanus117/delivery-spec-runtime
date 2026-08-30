---
id: INT-20260830-003
status: captured
area: review
source: current-user-session
capturedAt: 2026-08-30
issue: null
promotedTo: null
---

# 控制 Review 视角、范围和重复执行

## 原始问题

文档变更的 fresh reviewer 被要求完整反查源码、历史文档和全部机器合同，单轮耗时过长；修复后又因 reviewed path 变化持续触发重复 Review。

## 观察

- Reviewer 成功发现了命令顺序、软链参数和 public candidate 等准确性问题。
- Reviewer 的主要视角是 Contract Review，没有优先评价首次读者体验。
- 高强度、开放范围的任务缺少明确停止条件，调查持续扩展。
- LOW 的机械测试修复也准备重新执行完整 fresh review。

## 影响

Review 延迟交付，并把低风险文档修改按高风险实现处理；同时仍可能错过真正的可读性问题。

## 当前任务边界

本次不修改 Review schema、stale 合同或 reviewer 调度工具。

## 当前处置

- 维护者已取消不必要的额外 Review。
- 当前 README 使用直接 reader walkthrough 和聚焦合同测试验证。

## 后续候选

- 明确 Reader Review 与 Contract Review 两种视角。
- Reviewer 输入必须包含范围和停止条件。
- 根据 finding severity 和修复类型决定是否需要重新 fresh review。
- 保留高风险代码“任一受审路径变化即 stale”的严格规则。

## 证据

- `openspec/changes/archive/2026-08-30-reorganize-runtime-documentation/implementation-review.json`
- 当前用户会话
