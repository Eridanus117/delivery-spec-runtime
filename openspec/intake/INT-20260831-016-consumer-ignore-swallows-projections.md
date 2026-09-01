---
schemaVersion: 1
id: INT-20260831-016-consumer-ignore-swallows-projections
state: captured
phase: capture
source: upgrade-agent-system-evidence
capturedAt: 2026-08-31
promotedTo: null
---

# Intake

## 原始问题

消费仓自身的 `.gitignore` 与本机 `.git/info/exclude` 规则可以吞掉 Runtime 受管投影：投影文件在本机被静默忽略、进不了提交，而 runtime-check 只查工作树摘要、本机照样 PASS，坏账要等他人 clone 后因投影缺文件 fail-closed 才暴露。软链时代真实字节不在父仓工作树，这类规则无害；PR #16 改为可校验复制后才第一次真正命中。本次 INT-20260831-015 升级实测：消费仓 agent-system 两处规则各吞一条投影——`.gitignore` 的 `.omp/commands/opsx-*.md` 吞掉 `.omp/commands`（已删规则修复），本机 `.git/info/exclude` 末行的 `.claude/skills/` 吞掉 `.claude/skills/delivery-pilot`（只用 git add -f 绕过一次，规则仍在，会复发）。

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

- 文档侧：消费指南「更新 Runtime gitlink」一节补一条检查项——升级后核对四条受管投影均未被父仓 `.gitignore` 或本机 `.git/info/exclude` 吞掉。成本低，但依赖人照做。
- 工具侧：`runtime-check` 直接对 runtime-manifest 声明的受管路径跑 `git check-ignore` 断言，命中即 fail-closed。把「靠人记得核对」换成机器强制，但需确认在无 git 或非 git 消费场景下的降级行为。

两条不互斥；工具侧若成立，文档侧可退为解释性说明。留待统一 triage 定夺。

## Disposition

决定：
理由：
下一步：

## History

- 2026-08-31T22:08:58.204Z captured
