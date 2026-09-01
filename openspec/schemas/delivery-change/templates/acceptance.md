# 验收

## 前置门禁

- [ ] `task-state.json` 全部 verified，07 投影一致。
- [ ] `implementation-review.json` 为当前、PASS，且没有 OPEN finding。
- [ ] 实际 implementation commit、依赖版本和目标环境已锁定，06 必需场景可执行。

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
- 只有必需场景有证据、无 critical 且清理成功时才能填写 PASS。

## Acceptance State

正文和证据完成后执行 `delivery-lifecycle.ts acceptance write`。只有生成的
`acceptance-state.json` 仍绑定当前 Review、task state、implementation commit 和本文件摘要时，09 才能继续。
