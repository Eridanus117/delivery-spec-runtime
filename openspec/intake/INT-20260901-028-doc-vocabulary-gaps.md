---
schemaVersion: 1
id: INT-20260901-028-doc-vocabulary-gaps
state: captured
phase: capture
source: review-finding
capturedAt: 2026-09-01
promotedTo: null
changeObject: doc-expression
---

# Intake

## 原始问题

陌生读者审读说明文档时圈出一批「没解释就直接用」的词，绝大多数是本单没碰过的存量表述：OMP、gitlink、fail-closed、总闸门、runtime-update、指标子系统、A1、信号6、以及同一批仓库的四个叫法（项目仓/消费仓/资产仓/接入方）。另外 schema、contract、profile 三个目录的分工从没解释过，而禁词名单被放进 profiles 目录也与「profile 是阶段合同」的定义不符。这些不影响机器行为，但让第一次读文档的人反复卡住。

## Triage

范围：README、AGENTS.md、交互指引与 docs/ 下说明文档里的存量词汇与命名不一致，以及 openspec/ 三个目录的分工说明。
不含：与工件层数、批准口径、命令清单、分析线调用示例、审读记录相关的过时表述——那些是「精简工件与说人话」这一单引入或该修的，**已在该单的终审返工里清扫完毕**（含说明文档里讲旧版目录结构的两段）。本条只留纯词汇与命名口径的问题。
影响：只改说明面，不碰任何机器可读约束。
判断：continue——问题清楚、代价小，但与本单的改动面不重叠，单独做更干净。

## Evidence

### 已知事实

- 两轮陌生读者审读各圈出一批未解释词，重合度很高，说明不是偶然的表达疏漏。
- 同一批仓库在四份文件里有四个叫法：项目仓、消费仓、资产仓、接入方。命令参数里还有四个「root」
  （--change-root、--asset-root、--intake-root、--runtime-root），没有一处解释各自指什么。
- `openspec/schemas/`、`openspec/contracts/`、`openspec/profiles/` 三个目录的分工从没写过；
  而禁词名单住在 profiles 目录里，与「profile 是可版本化的阶段合同」这个定义不符。
- 本单已建 `docs/glossary.md`，这批词的落点现成，只是还没搬进去。

### 未知与假设

### 证据

## Options

### 候选处置

## Disposition

决定：已登记，等待排期。
理由：不影响机器行为，但每个第一次读文档的人都会重新踩一遍。
下一步：按文档表达档走快车道，把这批词补进 docs/glossary.md，并统一仓库的叫法。

## History

- 2026-09-01T20:00:07.510Z captured
