---
schemaVersion: 1
id: INT-20260901-023-repo-suited-workflow
state: captured
phase: capture
source: maintainer-direction
capturedAt: 2026-09-01
promotedTo: null
changeObject: governance-contract
---

# Intake

## 原始问题

维护者原话：「目前这个仓库自己的工作流我觉得不合适，我们生成了大量我不看的文档和文件。需要设计、制作一个适合本仓库的工作流」

> **排队中，待修小刺批次（`fix-thorn-batch`）验收后启动。** 本条目按维护者指示只做登记（capture 即止），
> 不在本轮推进任何分析或处置；下面各节留白是刻意的，不是遗漏。

## Triage

范围：（待启动后填写。初步方向：本仓自己的 `delivery-change` 交付流水线形状——工件集、站位数、
写盘清单与人工审阅面。不含消费仓侧的接入方式。）
影响：（待填写）
判断：（待填写）

## Evidence

### 已知事实

（待启动后系统整理。以下为登记时已在案、可直接作为输入的材料，先列位置不作结论：）

- `openspec/intake/INT-20260831-014-calibration-signals.md`：校准期信号台账，信号 1～10。其中信号 9
  记录了强制版分析线第一单真跑的实况，含三条使用成本与三条门禁缺口；信号 10 即本条目的立论原话。
- `openspec/intake/INT-20260831-019-three-item-retrospective.md`：三事项复盘卷宗，已逐项统计过
  「哪些资产有机器读者、哪些零消费」，并列出过零消费资产名单。
- 本轮实施期在案的四条「已知但本批不修」的机器缺陷（裁定 #4 / #6 / #7 / #8）：路由表缺
  `.gitattributes`、`.github/**`、`openspec/changes/archive/**`、`openspec/specs/**` 四处路径前缀；
  档位交叉校验对未声明 `changeObject` 的条目直接跳过；`test/contracts.test.ts` 的 `VC-039` 是钉死
  active Change 完整集合的点时快照，任何新建 Change 都会让它转红；`openspec/intake/README.md`
  仍写着已被并站移除的五阶段顺序，且其「记录 Issue URL」的要求与 `assertSafeContent()` 的绝对路径
  正则冲突（该正则会把任何 `https` 开头的链接一并拦下），带链接的条目无法被处置。
- `AGENTS.md` 的校准条款：预置了「强制版分析线跑满 2 单后复盘裁定 A1 留/修/杀」的触发点。

### 未知与假设

- 维护者「不看」的具体是哪些文件：是全部工件，还是其中若干类？需要按资产逐类核对真实消费情况，
  不能凭推断裁剪——`INT-019` 已有一套「机器读者 / 人类读者」的分类口径可复用。
- 「适合本仓库」的判据是什么：单人仓、公开共享运行时、自身即治理对象，这三条约束各自要求保留什么。
- 重设计与既有归档证据的关系：改流水线是否要求迁移存量 Change 目录（既有取向是「存量不迁移」）。

### 证据

（待启动后补。登记时仅有维护者原话一条，见「原始问题」。）

## Options

### 候选处置

（待启动后展开。登记时不预设候选，避免把方向锁死在一次未经分析的直觉上。）

## Disposition

决定：（未处置，排队中）
理由：单事项在线。当前流水线上是 `fix-thorn-batch`（修小刺批次），本条目按维护者指示登记排队，
待其验收后启动。
下一步：`fix-thorn-batch` 验收归档后，以本条目发起分析线；届时同时消费上列四条「本批不修」的
机器缺陷与校准信号台账。

## History

- 2026-09-01T07:43:47.487Z captured
