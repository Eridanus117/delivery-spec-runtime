---
schemaVersion: 1
id: INT-20260831-017-runtime-check-misses-symlink-mode-index-entry
state: captured
phase: capture
source: upgrade-agent-system-evidence
capturedAt: 2026-08-31
promotedTo: null
---

# Intake

## 原始问题

Windows `core.symlinks=false` 下，git 会把复制得到的普通文件仍按 `120000`（软链）模式写进 index：路径在旧 index 里是软链条目且路径类型仍是文件时，git add 沿用旧模式，把整份文件内容当成「软链目标字符串」入库。runtime-check 只校验文件系统上的摘要、不校验 index 模式，因此这种坏条目能通过校验、被带病提交；而任何软链可用的机器 clone 出来会得到一个指向乱码路径的废软链，投影直接不可用。本次 INT-20260831-015 升级实测复现：`openspec/tools/runtime-entry.ts` 首次 git add 后 `git ls-files -s` 显示模式 120000、blob 大小 11445 字节，reflog 里 amend 前的 tree 留有硬证据；用 git rm --cached 加重新 add 才拿到 100644。

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

- `runtime-check` 在消费仓侧增加一条断言：runtime-manifest 声明的受管投影在 git index 中的模式不得为 `120000`，命中即 fail-closed。这条能把本次坏账在提交前拦下，且与现有「只查工作树摘要」的检查互补——摘要相同但模式错误正是当前的盲区。

留待统一 triage 定夺；需一并确认非 git 消费场景下该断言如何降级。

## Disposition

决定：
理由：
下一步：

## History

- 2026-08-31T22:09:06.815Z captured
