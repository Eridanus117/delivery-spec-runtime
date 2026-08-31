---
schemaVersion: 1
id: INT-20260831-018-projected-runtime-entry-not-invocable
state: captured
phase: capture
source: upgrade-agent-system-evidence
capturedAt: 2026-08-31
promotedTo: null
---

# Intake

## 原始问题

受管投影里的 `openspec/tools/runtime-entry.ts` 副本从消费仓侧直接调用会失败，报「Runtime 源仓缺少 runtime-manifest.json」。机理：`sourceRootFromScript()` 以脚本自身位置向上两级定位 runtime-manifest.json；软链时代 Node 默认解析软链，脚本落点在 submodule 内、向上两级正好是 submodule 根，能找到 manifest。PR #16 改为真实副本后，向上两级变成消费仓根，那里没有 manifest，于是 fail——对软链可用的类 Unix 消费仓而言，这是行为回归（本机软链已降级为文本占位，该路径本来就不可用，无额外损失）。放大面：投影出来的 `.omp/commands/opsx-*.md` 正文里有 19 处会被照抄执行的命令行走这条形态的路径（分布在 7 个文件；另有 9 处仅为文件头形态注释、不构成危害）。

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

- 修复入口：`sourceRootFromScript()` 向上两级找不到 runtime-manifest.json 时回落到 `findConsumerRoot()`，让投影副本在消费仓侧也能作为入口被调用，恢复软链时代的行为。
- 收缩合同：显式声明该投影不作为可调用入口（只是给 IDE 或人看的引用副本），并把 `opsx-*.md` 正文那 19 处命令行统一改成消费仓形态路径，消除误导。

两条方向相反，须先裁决「投影副本到底算不算入口」这个定位问题，再谈实现。留待统一 triage 定夺。

## Disposition

决定：
理由：
下一步：

## History

- 2026-08-31T22:09:15.625Z captured
