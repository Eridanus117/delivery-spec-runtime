# 验收

## Change 模式

- 模式：delivery / rehearsal
- 模式来源：缺少 `change-mode.json` 时为 delivery；rehearsal 必须引用完整声明。
- rehearsal 原因与批准：

## 前置门禁

- [ ] delivery：`07-实施任务/tasks.md` 无未完成复选框。
- [ ] delivery：实际 commit、依赖版本和目标环境已锁定，06 必需场景、runner、输入和清理规则可执行。
- [ ] rehearsal：逐项列出未完成、跳过和阻塞，不把既有源码或 artifact 文件存在写成已完成。
- [ ] rehearsal：未伪造 run-id、环境、输入、输出、trace 或清理结果。

## 验收对象

| 仓库/制品 | 实际 Commit/版本 | 目标环境 | 依赖 |
|---|---|---|---|

## Requirement 覆盖与结论

| Requirement/Scenario | Run ID | 证据路径 | 结果 | 偏差 |
|---|---|---|---|---|

## 验收运行

```text
08-验收/runs/<run-id>/
├── metadata.json
├── inputs/
├── outputs/
├── traces/
├── cleanup/
└── conclusion.md
```

每个 run-id 保存实际 commit、环境、机器、开始/结束时间、完整输入输出、trace、Requirement 覆盖、偏差、清理和 PASS/FAIL。失败或阻塞记录不得覆盖。

## Critical 与清理

- 未解决 critical：
- 清理结果：

## 最终验收结论

- 结论：PASS / PARTIAL / FAIL / BLOCKED
- 依据：
- delivery 只有必需场景有证据、无 critical 且清理成功时才能填写 PASS。
- rehearsal 只能填写 PARTIAL、FAIL 或 BLOCKED，禁止 PASS；它只验证流程和失败门禁。
