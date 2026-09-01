---
schemaVersion: 1
id: INT-20260901-024-evl-independent-verification
state: captured
phase: capture
source: maintainer-direction
capturedAt: 2026-09-01
promotedTo: null
changeObject: governance-contract
---

# Intake

## 原始问题

维护者 2026-09-01 拍板采纳 **EVL 独立复验原则**（Execution Validation Loop，源自外部项目 vibecode-pro-max-kit 的深读，GitHub withkynam 名下；深读报告与裁决记录在维护者事务台）：

> 执行 agent 自报「门禁全绿」不作为验收输入。验收须由**不带执行上下文的独立 agent** 重跑全部门禁命令（build/lint/test），以其实际输出为准。按流程重量分级：脚本级小事豁免，「小项目/重流程」级 Change 强制。

> **排队中，capture 即止。** 本条目只做登记，不在本轮推进分析或改动任何站位资产；
> 落点应由 `INT-20260901-023-repo-suited-workflow`（本仓工作流重设计）在设计验收站形状时一并消费，
> 避免在待重设计的流水线上先叠一条规则。下面各节留白是刻意的。

## Triage

范围：（待 INT-023 启动后并入其分析。初步判断：影响 08-验收 站的验收判据来源——由「执行侧自证」改为「独立复验」。）
影响：（待填写）
判断：（待填写）

## Evidence

### 已知事实

- 维护者裁决原文与机制说明：见维护者事务台 2026-09-01 的 vibecode 深读报告（EVL 针对的三种失真：跑子集当全量、改测试凑绿、没跑凭推理报绿；根因是执行者验收自己的工作）。
- 本仓现状：验收记录由执行侧会话产出（见 `openspec/changes/archive/2026-09-01-fix-thorn-batch/08-验收/`），无独立复验步骤。

### 未知与假设

- 独立复验 agent 的门禁命令清单从哪个资产机读取得（避免复验者也靠执行者口述）。
- 与既有 implementation-review（独立评审）的关系：合并为一站还是两个不同关注点。

### 证据

（登记时仅维护者裁决一条，见「原始问题」。）

## Options

### 候选处置

（待 INT-023 展开，不预设。）

## Disposition

决定：（未处置，排队中）
理由：本仓工作流重设计（INT-023）已在队列，验收站形状属其范围；先登记裁决，重设计时消费。
下一步：INT-023 启动时将本条目列为输入。

## History

- 2026-09-01T17:03:57.000Z captured
