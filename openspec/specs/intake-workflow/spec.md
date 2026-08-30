## Purpose

将 `openspec/intake/` 从人工目录约定提升为 Runtime 管理的前置工作流。它承载需求是否值得投入的事实、未知、证据、候选处置和人工判断；只有明确承诺实施后才进入正式 Change。

## Requirements

### Requirement: Intake asset SHALL have a machine-readable lifecycle contract

每个 Intake asset SHALL 具有稳定的 `id`、`state`、`phase`、`source`、`capturedAt`、`promotedTo` 字段，并 SHALL 使用统一模板记录原始问题、已知事实、未知与假设、证据、候选处置、当前判断和后续动作。

#### Scenario: 创建最小 Intake

- **WHEN** 调用方捕获一个尚未决定是否投入的问题
- **THEN** Runtime SHALL 在项目仓 `openspec/intake/` 创建或验证一个 `INT-<YYYYMMDD>-<三位序号>-<slug>.md` asset，初始 `state` 为 `captured`、`phase` 为 `capture`，并 SHALL 要求来源和原始问题

#### Scenario: 缺少必填元数据

- **WHEN** Intake 缺少 `id`、`state`、`phase`、`source` 或 `capturedAt`
- **THEN** inspect、advance、promote 和 close SHALL fail closed，并 SHALL 返回缺失字段，而不得猜测默认值

### Requirement: Intake SHALL expose an explicit DAG

Runtime SHALL 实现以下有向阶段图：`capture → triage → evidence → options → disposition`。`disposition` SHALL 只有三个出口：`promote`、`hold` 和 `close`；`hold` SHALL 能显式回到 `triage`，`closed` SHALL 只能经显式 reopen 回到 `triage`。

#### Scenario: 按顺序推进

- **WHEN** 当前阶段已满足必填输入并请求下一阶段
- **THEN** Runtime SHALL 只推进到 DAG 中的直接后继阶段，并 SHALL 更新 asset 的 `phase` 和状态证据

#### Scenario: 跳过前置阶段

- **WHEN** 请求从 `capture` 直接进入 `evidence`、`options` 或 `disposition`
- **THEN** Runtime SHALL 拒绝操作，并 SHALL 保持原文件内容和生命周期状态不变

#### Scenario: 暂缓事项重新进入分析

- **WHEN** `disposition` 选择 `hold` 后再次请求处理
- **THEN** Runtime SHALL 要求显式 reopen/continue 语义，并 SHALL 将事项回到 `triage`，保留原 hold 理由和历史

### Requirement: Intake stages SHALL require distinct evidence

Runtime SHALL 对阶段输入执行最小结构校验：`capture` 要求原始问题和来源；`triage` 要求范围、影响和继续/暂缓/关闭判断；`evidence` 要求已知事实、未知事项和至少一个证据引用；`options` 要求至少一个候选处置及其取舍；`disposition` 要求人工决定、理由和下一步。

#### Scenario: 事实与推断分开记录

- **WHEN** 事项进入 `evidence`
- **THEN** Runtime SHALL 分别保留已知事实、未知事项和假设，并 SHALL 不得把未验证推断自动标记为事实

#### Scenario: 候选不等于批准

- **WHEN** 事项进入 `options`
- **THEN** Runtime SHALL 允许记录多个候选及取舍，但 SHALL 保持事项未决，直到人工在 `disposition` 记录出口

### Requirement: Promote SHALL hand off to a Change without duplicating authority

只有 `disposition` 的人工决定为 `promote` 时，Runtime SHALL 允许将 Intake 关联到一个已存在的 Change；Promote SHALL 写入 `state: promoted` 和 `promotedTo`，并 SHALL 要求目标 Change 的原始需求索引引用该 Intake。Promoted Intake SHALL 成为只读来源索引，Change SHALL 成为后续正式 Requirement、方案、任务和证据的工作真源。

#### Scenario: 成功 Promote

- **WHEN** 人工选择 `promote` 且提供有效的 Change slug
- **THEN** Runtime SHALL 验证目标 Change 存在、建立双向来源引用，并 SHALL 保留 Intake 的原始问题和转化摘要

#### Scenario: 没有人工决定时 Promote

- **WHEN** Intake 只有候选方案但没有 `disposition` 人工决定
- **THEN** Runtime SHALL 拒绝 Promote，并 SHALL 不创建 Change、不修改 Intake 状态

#### Scenario: Promote 目标不存在

- **WHEN** 请求 Promote 到不存在或越界的 Change 路径
- **THEN** Runtime SHALL fail closed，并 SHALL 不写入 Intake、目标 Change 或 Runtime submodule

### Requirement: Close and Hold SHALL preserve disposition evidence

`hold` 和 `close` SHALL 要求人工提供原因和下一步；`closed` asset SHALL 保留关闭原因，`held` asset SHALL 保留恢复条件。Runtime SHALL 不因缺少实施意愿而删除 Intake 记录。

#### Scenario: 关闭不值得处理的事项

- **WHEN** 人工在 `disposition` 选择 `close` 并提供关闭原因
- **THEN** Runtime SHALL 将状态设为 `closed`，保存原因和时间，并 SHALL 禁止其继续进入 Change

#### Scenario: 暂缓事项

- **WHEN** 人工选择 `hold` 并提供恢复条件
- **THEN** Runtime SHALL 将状态设为 `held`，保留现有证据和候选，不 SHALL 将其标记为已完成或已拒绝

#### Scenario: 关闭事项重新打开

- **WHEN** 人工提供 reopen 理由并重新打开 `closed` Intake
- **THEN** Runtime SHALL 保留关闭历史，将事项回到 `triage`，并要求重新经过后续阶段

### Requirement: Intake operations SHALL be confined to the asset repository

Intake 命令 SHALL 只读写调用方指定的项目仓 `openspec/intake/`、目标 Change 和受控证据路径；在 Runtime submodule、公共 Runtime 源码、合同测试之外不得写入业务事项、凭据、请求响应全文或敏感环境值。

#### Scenario: 拒绝写入 Runtime submodule

- **WHEN** Intake 请求的目标路径位于 `.delivery-spec-runtime` 或 Runtime 源码根之外的未授权路径
- **THEN** Runtime SHALL 拒绝操作，并 SHALL 确认受控路径未被修改

#### Scenario: 拒绝敏感内容

- **WHEN** Intake asset 或证据包含凭据、绝对环境路径、机器标识或请求响应全文
- **THEN** Runtime SHALL 拒绝保存或要求脱敏，并 SHALL 不把该内容写入公共 Runtime 资产

### Requirement: Legacy Intake records SHALL have a controlled migration path

现有只有 frontmatter/status、没有 `phase` 和完整章节的 Intake 记录 SHALL 被识别为 legacy；Runtime SHALL 允许 inspect 显示迁移缺口，但 SHALL 不把 legacy 记录静默视为已完成阶段或自动 Promote。

#### Scenario: 检查 legacy 记录

- **WHEN** inspect 读取缺少新合同字段的现有 Intake
- **THEN** Runtime SHALL 返回 `legacy` 状态、缺失字段和建议迁移动作，并 SHALL 保持原文件不变
