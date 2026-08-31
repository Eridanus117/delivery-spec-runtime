---
schemaVersion: 1
id: INT-20260831-010-upgrade-smoke-flaky-status
state: captured
phase: capture
source: maintainer-session
capturedAt: 2026-08-31
promotedTo: null
---

# Intake

## 原始问题

openspec-upgrade 测试的消费仓 smoke 在 Windows 下偶发失败：合成消费仓的 runtime submodule 偶现归档证据 JSON 的 M 状态，runtime-check 因 submodule 不 clean 拒绝（fail-closed 行为正确，脏判定为 git racy 竞态）。已在 establish-human-interaction-layer 基线 commit 51829cc 重现同签名失败（5 跑 2 败），证明与该 Change 无关。候选处置：smoke 在 status 前执行 git update-index --refresh，或对候选/消费克隆统一 renormalize。

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

- 2026-08-31T18:35:13.702Z captured
