---
id: INT-20260830-001
status: captured
area: documentation
source: current-user-session
capturedAt: 2026-08-30
issue: null
promotedTo: null
---

# 建立 reader-first 文档验收方法

## 原始问题

README 虽然完成结构拆分、链接检查和机器合同验证，但第一次采用者仍然难以快速理解仓库价值、完整执行接入并知道下一步动作。

## 观察

- 第一版入口优先介绍 Runtime 内部组成，而不是采用者获得的能力。
- 快速开始依赖自然语言提示先提交，没有形成完全可顺序复制的步骤。
- 接入完成后缺少第一个 `/opsx-new` 动作。
- 验收重点是章节、关键词和链接，没有直接防守首次读者旅程。

## 影响

文档可以在技术上正确并通过测试，但仍然不能有效帮助新采用者。

## 当前任务边界

当前 README 任务直接修复具体阅读和 quickstart 问题；不在本任务中设计新的通用文档工作流。

## 当前处置

- README 改为首次采用者入口。
- 文档合同改为验证“理解、接入、开始第一个 Change”的顺序。

## 后续候选

- 定义 README 的 30 秒理解、五分钟接入和下一步动作检查表。
- 区分 Reader Review 与 Contract Review。
- 评估是否形成轻量 documentation-change 流程。

## 证据

- `README.md`
- `test/contracts.test.ts`
- 当前用户会话
