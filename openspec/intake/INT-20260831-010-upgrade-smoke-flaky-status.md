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

补记（2026-09-01，enforce-analysis-line-and-prune-pipeline 实施与两轮独立复审期间）：失败频次已明显高于「偶发」。本轮实测——独立复审连跑九次为 4 过 5 败；实施侧返工后连跑两轮为 1 过 1 败；期间另有连续三跑全败的记录。即**失败是多数情形**。据此，本仓沿用的「复跑两次全绿即视为通过」这一判据在当前环境下**已不可满足**，继续沿用等于用重试掩盖一个稳定存在的环境缺陷，并使「全量测试绿」这一完成标准长期不可稳定达成。**建议提高本条优先级**，按上述两个候选处置之一实际修复，而不是继续按噪音登记。另已定位到失败签名的具体触发面：被判 M 的文件恒为归档目录下一条很长的证据路径（`openspec/changes/archive/2026-08-30-prevent-live-runtime-update-mutation/08-验收/runs/.../outputs/<consumer>-runtime-check.json`），与 `INT-20260831-011` 记录的路径预算问题同源，两条可一并处置。

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
