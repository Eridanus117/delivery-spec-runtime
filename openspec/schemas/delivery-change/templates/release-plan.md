# 发布计划与快速资产

## Change 模式与交付结论

- 模式：delivery / rehearsal
- 结论：GO / NO-GO
- delivery 的 GO 表示 Change 已准备在功能分支完成 Spec Sync 和 Archive；不表示 PR 已创建或合并。
- rehearsal 必须为 NO-GO，禁止 Spec Sync、Archive 和 PR。

## 08 验收门禁

- [ ] delivery：当前 `acceptance-state.json` 为 PASS。
- [ ] delivery：至少一个 PASS run-id 覆盖必需 Requirement 和清理结果。
- [ ] rehearsal：08 结论为 PARTIAL、FAIL 或 BLOCKED，09 仅记录 NO-GO 原因。

## 发布范围

| 仓库/能力 | Commit/版本 | 环境 | 责任方 |
|---|---|---|---|

## 发布顺序与依赖

| 顺序 | 外部平台/人工动作 | 前置 | 成功标准 | 失败处置 |
|---:|---|---|---|---|

## 现场快速资产

```text
09-发布/assets/
├── log-queries/
├── dashboards/
├── alerts/
├── config-switches/
├── smoke/
└── rollback/
```

| 资产 | 路径/系统 | 用途 | 责任方 | 使用时点 |
|---|---|---|---|---|

## 日志、指标与观察窗口

| 指标/日志 | 基线 | 告警/停止条件 | 观察窗口 |
|---|---|---|---|

## 配置开关

| 系统/Key | 初始值 | 目标值 | 灰度步骤 | 回滚值 | 责任方 |
|---|---|---|---|---|---|

## 停止与回滚

- 停止条件：
- 回滚门槛：
- 回滚顺序：
- 回滚后验证：

## Spec Sync 与归档准备

| Delta Spec | Main Spec | Strict Validation | 结果 |
|---|---|---|---|

- [ ] 所有 delta specs 已同步到 `openspec/specs`，没有待应用差异。
- [ ] Change 与主 specs strict validate 全部通过。
- [ ] cleanup 证据存在且结论 PASS。
- [ ] 最终 PR 尚未创建；维护者将通过 `archive-readiness.json` 作 `prStarted=false` 声明。

## Archive Readiness

使用 `delivery-lifecycle.ts readiness write` 绑定 Acceptance、本文件、Spec Sync 输入输出和 cleanup
摘要。只有 `guard archive` 返回 allowed 才能移动 Change；不得再以 `release-id`、
`release-not-required`、任意关键词或人工复选框替代机器状态。

## 归档后 PR

1. 在功能分支归档 Change。
2. 对归档后的仓库执行 final strict validation 和完整测试。
3. final validation 通过后才创建 PR。
4. PR 反馈若要求改变实现或规格，停止合并并受控 reopen，重新 Review→Acceptance→Sync→Archive。
5. 消费仓 gitlink 更新由各消费仓独立 Change 管理，不阻塞 Runtime Archive。

决策依据分别保存在 `05-改造方案/方案提案.md` 和 `05-改造方案/方案决策.md`。
