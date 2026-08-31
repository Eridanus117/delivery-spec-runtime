---
schemaVersion: 1
id: INT-20260830-001-reader-first-documentation
state: closed
phase: disposition
source: current-user-session
capturedAt: 2026-08-30
promotedTo: null
---

# 建立 reader-first 文档验收方法

## 原始问题

README 虽然完成结构拆分、链接检查和机器合同验证，但第一次采用者仍然难以快速理解仓库价值、完整执行接入并知道下一步动作。

## Triage

范围：Runtime 公共文档的首次采用者入口、接入步骤和下一步动作。
影响：文档技术上正确但可能无法帮助新采用者完成第一次使用。
判断：close

## Evidence

### 已知事实

- 第一版入口优先介绍 Runtime 内部组成，而不是采用者获得的能力。
- 快速开始依赖自然语言提示先提交，没有形成完全可顺序复制的步骤。
- 接入完成后缺少第一个 `/opsx-new` 动作。
- 验收重点是章节、关键词和链接，没有直接防守首次读者旅程。
- README 已改为首次采用者入口；Quickstart 已形成可顺序复制的接入、提交、校验步骤。

### 未知与假设

- 后续是否需要独立的轻量文档工作流仍未决定。

### 证据

- `README.md`
- `test/contracts.test.ts`

## Options

### 候选处置

- 保持当前文档改造结果，并将新的通用文档工作流作为独立候选。

## Disposition

决定：close
理由：原始问题已由现有文档改造和合同测试解决；后续候选属于新的系统性改进，不作为本 Intake 的未完成事项。
下一步：保留后续候选，若决定改变命令或流程，创建新的 Intake/Change。

## 后续候选

- 定义 README 的 30 秒理解、五分钟接入和下一步动作检查表。
- 区分 Reader Review 与 Contract Review。
- 评估是否形成轻量 documentation-change 流程。

## History

- 2026-08-30T00:00:00.000Z legacy-normalized
- 2026-08-30T00:00:00.000Z closed: migrated from legacy status
