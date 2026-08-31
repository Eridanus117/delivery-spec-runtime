---
schemaVersion: 1
id: INT-20260831-011-archive-evidence-path-length
state: captured
phase: capture
source: maintainer-session
capturedAt: 2026-08-31
promotedTo: null
---

# Intake

## 原始问题

归档证据的仓内路径长度已逼近 Windows MAX_PATH 预算：现有最长约 155 字符，加上测试临时目录前缀（约 98）后余量不足 10；establish-human-interaction-layer 终验时三份证据日志因原名过长触发深层克隆 Filename too long，已缩名规避。候选处置：为归档证据定路径长度预算与命名约定（如 run-id 缩短、日志名限长、CI 加最长路径检查），或评估 core.longpaths 指引。

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

- 2026-08-31T19:06:10.707Z captured
