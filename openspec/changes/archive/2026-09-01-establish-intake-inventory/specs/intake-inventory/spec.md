## Purpose

为 Runtime 提供一个只读的 Intake inventory，使维护者和 Workflow 能够看到当前输入池的文件、身份、格式缺口和重复身份，而不把历史记录静默当成当前事项或替维护者作归属决定。

## ADDED Requirements

### Requirement: Inventory SHALL scan only controlled Intake assets

Inventory SHALL 只扫描调用方指定项目根下 `openspec/intake/` 中匹配 `INT-*.md` 的文件，按 POSIX 相对路径稳定排序，并 SHALL 返回每个文件的相对路径、身份摘要和格式分类。Inventory SHALL NOT 读取 Desk、其他仓库或 Intake 目录之外的业务资产。

#### Scenario: 生成确定性 Intake 清单

- **WHEN** 调用方在包含多个 Intake 文件的项目根执行 `intake list`
- **THEN** Runtime SHALL 返回机器可读清单，条目按相对路径稳定排序，并 SHALL 不修改任何文件或 Runtime submodule

#### Scenario: 没有受控 Intake 目录

- **WHEN** 调用方执行 `intake list` 但 `openspec/intake/` 不存在
- **THEN** Runtime SHALL 返回空清单和明确的目录状态，不 SHALL 扫描项目根或隐式创建目录

### Requirement: Inventory SHALL report duplicate identities without choosing an authority

Inventory SHALL 对可解析的 Intake `id` 分组，并 SHALL 报告同一 `id` 对应的全部文件。发现重复身份时，Runtime SHALL 返回非成功诊断或显式冲突字段，但 SHALL NOT 静默选择、删除、重命名或合并任何文件。

#### Scenario: 发现重复 Intake ID

- **WHEN** 两个或更多 Intake 文件声明相同 `id`
- **THEN** Runtime SHALL 列出该 ID 和全部冲突文件，保持文件内容和生命周期状态不变，并 SHALL 要求人工决定归属

### Requirement: Legacy Intake SHALL be visible and non-authoritative

Inventory 和 `inspect` SHALL 将缺少新 Intake 合同字段或使用旧 `status` 字段的 `INT-*.md` 标为 `legacy`，返回缺失字段和迁移建议；Runtime SHALL NOT 将 legacy 静默视为已完成、自动 Promote 或修改原文件。

#### Scenario: 检查 legacy Intake

- **WHEN** `inspect` 读取缺少 `schemaVersion`、`state` 或 `phase` 的 Intake
- **THEN** Runtime SHALL 返回 `legacy` 分类、缺失字段、原始文件路径和迁移建议，并 SHALL 保持原文件不变

#### Scenario: 当前 Intake 与 legacy 共存

- **WHEN** 清单同时包含当前合同 Intake 和 legacy Intake
- **THEN** Runtime SHALL 分别标记两者，不 SHALL 用 legacy 条目覆盖当前条目或将二者合并为一个状态

### Requirement: Inventory output SHALL preserve fail-closed boundaries

Inventory 输出 SHALL 使用固定的机器可读字段和枚举，解析失败、非法路径或敏感内容 SHALL 产生明确失败，不 SHALL 通过默认值伪造身份、状态或迁移结果。

#### Scenario: Intake 文件无法解析

- **WHEN** 受控 Intake 文件的 frontmatter 无法解析或身份缺失
- **THEN** Runtime SHALL 将其报告为 `invalid` 或包含明确缺口的非当前分类，并 SHALL 不修改文件、不猜测身份
