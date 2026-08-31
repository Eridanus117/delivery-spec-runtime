---
schemaVersion: 1
id: INT-20260831-009-windows-crlf-render-drift
state: captured
phase: capture
source: maintainer-session
capturedAt: 2026-08-31
promotedTo: null
---

# Intake

## 原始问题

Windows autocrlf=true 检出环境下，.omp 渲染物与源文件被转为 CRLF，render-commands check 的字节级比较报九个 Commands 全部漂移，连带 command-renderer 与 openspec-upgrade 共 3 项测试在本地失败；HEAD 的 LF 克隆中全部通过，属检出环境问题而非内容漂移。候选处置：仓库 .gitattributes 强制相关路径 eol=lf，或 check 做行尾归一化比较。

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

- 2026-08-31T18:16:52.741Z captured
