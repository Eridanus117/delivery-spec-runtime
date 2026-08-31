---
schemaVersion: 1
id: INT-20260831-012-windows-temp-eperm-flake
state: captured
phase: capture
source: maintainer-session
capturedAt: 2026-08-31
promotedTo: null
---

# Intake

## 原始问题

bootstrap 测试在 Windows 下偶发 EPERM：清理临时目录 bootstrap-test-* 时被拒（疑为反病毒/索引器短暂锁定），单轮偶发、重跑即过。与 INT-010（upgrade smoke racy status）同属 Windows 环境竞态家族。候选处置：临时目录清理加重试、或测试收尾对 EPERM 做有限退避。

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

- 2026-08-31T19:07:31.062Z captured
