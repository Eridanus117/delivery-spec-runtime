# delivery-lifecycle-governance Specification

## Purpose

使 Runtime `delivery-change` 以独立方案提案和决策、绑定源码的实现 Review、内容寻址验收和先归档后 PR 的顺序完成可审计闭环。

## ADDED Requirements

### Requirement: 方案提案与决策必须是独立 Artifact

Schema MUST 在 05 中依次要求 `solution-proposal`、`solution-decision` 和 `change-plan`。三者 MUST 分别计算 digest 和批准；Proposal MUST 呈现候选与 trade-off，Decision MUST 记录维护者选择、依据、拒绝方案和接受后果。

#### Scenario: 未决提案不得进入实施计划

- **WHEN** Proposal 缺少两个候选、Trade-off、推荐或未决问题，或者 Decision 未批准
- **THEN** `guard apply` 非零拒绝
- **AND** 不得用 `change-plan` 的批准代替 Proposal 或 Decision 批准

### Requirement: Implementation Review 必须绑定完整实现范围

Review 状态 MUST 绑定 baseline commit、reviewed commit、baseline→reviewed 的全部实现路径、逐路径 SHA-256、聚合摘要、Reviewer、findings 和结论。当前路径或 commit 与记录不一致时 MUST stale。

#### Scenario: Review 遗漏实现文件

- **WHEN** reviewedPaths 少于或多于 baseline→reviewed 的实现路径集合
- **THEN** Review 写入非零拒绝

#### Scenario: Review 后实现变化

- **WHEN** Review PASS 后任一受审实现路径变化、删除，或者 reviewed commit 不再是当前 HEAD 的祖先
- **THEN** Review inspect 和后续 Acceptance 非零拒绝并报告 stale；只增加当前 Change 生命周期证据或同步后的长期 spec 不使 Review stale

#### Scenario: Finding 未解决

- **WHEN** 存在任意 OPEN finding
- **THEN** Review 不能记录 PASS

### Requirement: Acceptance 必须内容寻址当前 Review

Acceptance State MUST 绑定 PASS 且未 stale 的 Review 摘要、`task-state.json` 摘要、验收正文摘要和 reviewed commit。全部实现任务 verified、Review 当前且验收正文严格 PASS 后才能写入；Review、任务状态或正文后续变化时 MUST stale。

#### Scenario: 验收引用旧 Review

- **WHEN** Review、实现路径、task state 或验收正文在 Acceptance 后变化
- **THEN** acceptance guard 非零拒绝

### Requirement: Archive 必须在 PR 前由严格状态放行

Archive Readiness MUST 绑定当前 Acceptance、Spec Sync 输入输出摘要、strict validation、cleanup 证据和 `prStarted=false` 维护者声明。Archive guard MUST 只接受当前 `READY` 状态，不得依赖 09 Markdown 关键词或 PR URL。

#### Scenario: 归档准备完整

- **WHEN** Review、Acceptance、Spec Sync、strict validation 和 cleanup 全部当前，且维护者声明尚未创建 PR
- **THEN** Archive guard 返回 allowed
- **AND** Change 可在功能分支归档后进行 final validation

#### Scenario: PR 已开始或规格未同步

- **WHEN** `prStarted=true`、delta/main spec 摘要缺失、状态 stale 或 cleanup 非 PASS
- **THEN** Archive guard 非零拒绝

### Requirement: PR 反馈导致的行为变化必须受控 Reopen

归档后的 Change 若因 PR 反馈需要修改实现或规格，MUST 通过受控 reopen 恢复 active；旧 Review、Acceptance、Readiness 和 08/09 证据 MUST 保存到 lifecycle history，新生命周期 MUST 从 Review 重新开始。

#### Scenario: 归档后修改行为

- **WHEN** PR 反馈要求修改代码、合同、长期 spec 或可观察行为
- **THEN** 工具保留旧生命周期快照并恢复 active Change
- **AND** 旧 PASS 状态不能继续通过门禁

### Requirement: Runtime 与消费仓归档必须解耦

Runtime Change 的 Archive MUST NOT 等待消费仓 gitlink 升级。消费仓采用新 Runtime commit MUST 在各自仓库的独立 Change 中验证和归档。

#### Scenario: Runtime 已准备交付但消费仓尚未升级

- **WHEN** Runtime 内部 Review、Acceptance、Spec Sync 和 Readiness 全部通过
- **THEN** Runtime Change 可以归档并创建 PR
- **AND** 不得因消费仓尚未采用而阻塞 Runtime Archive
