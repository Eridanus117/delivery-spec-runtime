---
schemaVersion: 1
id: INT-20260831-013-release-package-distribution
state: captured
phase: capture
source: maintainer-direction
capturedAt: 2026-08-31
promotedTo: null
---

# Intake

## 原始问题

维护者提出：Runtime 向消费仓的分发不应继续使用 submodule + 受管软链，应改为 Release 包方式（版本化制品 + 完整性锁，消费仓获得普通文件）。动因证据：2026-08-31 会话实测的 Windows 软链痛点（core.symlinks 依赖、CRLF 检出纠缠、深路径克隆超限 INT-011、升级需重跑 apply）。注意：此方向推翻既有『禁止复制投影与第二套 lock』裁决（AGENTS.md），等于以包版本+哈希锁替换 gitlink 锁，防漂移需新的完整性合同承接；与『PR 合入 → Release → 消费仓升级』流水线衔接。待维护者发起后走完整分析与方案比较。

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

- 2026-08-31T19:30:28.006Z captured
