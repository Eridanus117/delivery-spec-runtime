---
schemaVersion: 1
id: INT-YYYYMMDD-000-slug
state: captured
phase: capture
source: 
capturedAt: YYYY-MM-DD
promotedTo: null
changeObject: 
---

<!--
登记线只有两个节点：已登记（state: captured）与已处置（promoted / held / close 三出口）。
下面五个小节全部写全后，一次 promote / hold / close 即可完成处置，不需要任何前置 advance；
缺小节会在处置时被一次性全部报出。phase 是只读兼容字段，不再由任何命令写入。
changeObject 可选，声明本条目的改动对象（governance-contract / tool-code /
doc-expression / ledger-only），立项门据此查路由表判交付档位与是否必走分析线；
不声明即按未匹配取最重档。
-->

# Intake

## 原始问题


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

