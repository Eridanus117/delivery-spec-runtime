# 发布计划与快速资产

## Change 模式与发布结论

- 模式：delivery / rehearsal
- 结论：GO / NO-GO
- rehearsal 必须为 NO-GO，禁止现场执行资产、release-id、配置修改、发布、spec sync 和 archive。

## 08 验收门禁

- [ ] delivery：`08-验收/acceptance.md` 结论为严格 PASS。
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

## 外部发布记录

delivery 模式使用：

```text
09-发布/releases/<release-id>/
├── metadata.json
├── steps.md
├── observations.md
├── config-state.json
├── rollback.md
└── conclusion.md
```

delivery 的失败或阻塞发布不得覆盖；重试使用新 release-id。无需发布时记录 `release-not-required` 及依据。
rehearsal 不得创建 `releases/` 或 release-id。

## 归档门禁

- [ ] delivery：至少一个 release-id 成功，或已明确记录 `release-not-required`。
- [ ] delivery：观察窗口完成，日志、指标、开关和回滚状态完整，且 `/opsx-verify` 无 critical。
- [ ] rehearsal：始终禁止 spec sync 和 archive；NO-GO 是流程演练的终态。

决策依据留在 `05-改造方案/change-plan.md`；跨项目工作时间线留在 `work-knowledge`。
