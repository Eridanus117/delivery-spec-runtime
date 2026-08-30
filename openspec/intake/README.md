# OpenSpec Intake

`openspec/intake/` 保存尚未承诺实施的问题、观察和外部需求。它位于外部输入与正式 Runtime Change 之间：先保留原始语义和证据，之后再统一判断是否值得处理。

## 与其他目录的边界

| 位置 | 含义 |
|---|---|
| `openspec/intake/` | 已发现，但尚未承诺实施 |
| `openspec/changes/<change>/` | 已决定处理，正在交付 |
| `openspec/specs/` | 已验收并长期生效的行为要求 |
| `openspec/changes/archive/` | 已完成 Change 的历史证据 |

Intake 不是当前操作文档、长期 spec 或 active Change，不得用它绕过正式决策和交付门禁。

## 一项一个文件

文件名使用：

```text
INT-<YYYYMMDD>-<三位序号>-<简短主题>.md
```

每项至少记录：

- 原始问题及来源；
- 可核验观察，不把推断写成事实；
- 影响和当前任务边界；
- 当前处置；
- 后续候选；
- 提升后的 Change 或关闭原因。

## 状态

- `captured`：已记录，尚未判断。
- `triaged`：已理解影响和边界，尚未承诺实施。
- `promoted`：已进入正式 Change，并填写 `promotedTo`。
- `closed`：不处理、重复或已由其他工作解决，并记录原因。

## Issue 的角色

仓内 intake 是内部转化记录的权威位置。GitHub Issue 只在需要公开讨论、通知或跨仓协作时使用；存在 Issue 时在 intake 中记录 URL，但不要求两边状态和正文完全同步。

## 当前任务中的处理规则

- 影响当前交付正确性的问题：当场修复。
- 当前范围外的系统性改进：记录 intake，不扩展当前任务。
- 安全、凭据或数据破坏风险：立即停止当前路径并升级处理。

## 提升为 Change

统一 triage 后，只有明确决定实施的项目才创建 Change。Change 的原始需求索引引用 intake 文件，保留外部输入到内部 Requirement 的转化链；不要复制并分叉原始正文。
