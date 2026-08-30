## Purpose

让新采用者、消费仓维护者和 Runtime 维护者从统一入口快速找到当前任务所需的唯一文档，同时保持长期规格、机器合同和历史证据的权威边界。

## MODIFIED Requirements

### Requirement: README 必须是可执行的采用与维护入口

Runtime README MUST 作为简洁的仓库入口，清楚说明用途、适用范围、最短接入路径、核心安全不变量、最终验证命令和按任务组织的文档导航。架构、消费仓操作、Runtime 维护、受控 OpenSpec 升级和 Runtime 自治理的详细说明 MUST 分别由 `docs/architecture.md`、`docs/consumer-guide.md`、`docs/maintainer-guide.md`、`docs/openspec-upgrade.md` 和 `docs/governance.md` 承担。README 和专题文档 MUST 明确区分使用说明、长期规格、机器合同、active Change、归档证据和 Agent 规则，不得把历史 Change 当作当前操作手册，也不得复制机器合同形成第二真源。

#### Scenario: 新采用者和维护者读取 README

- **WHEN** 新采用者需要接入 Runtime，或维护者需要执行 Runtime 专项任务
- **THEN** README 提供可直接执行的最短接入和最终验证命令，并按任务链接到对应专题文档
- **AND** README 明确实时仓禁止 `openspec update`、`.omp/commands` 是渲染物、真实消费仓不得承担候选写入

#### Scenario: 新采用者从 README 完成接入

- **WHEN** 新采用者首次打开 Runtime README
- **THEN** README 在不要求阅读维护或治理细节的情况下提供可直接执行的 submodule、受管软链和 `runtime-check` 最短接入步骤
- **AND** README 提供按任务选择专题文档的导航

#### Scenario: 维护者定位专题操作

- **WHEN** 维护者需要修改 Commands、升级 OpenSpec 或执行 Runtime 自治理
- **THEN** README 分别链接到对应专题文档，专题文档包含前置条件、命令、预期结果、失败处理和验证
- **AND** 所有仓库内 Markdown 链接均指向存在的目标

#### Scenario: 读者判断信息权威性

- **WHEN** 文档同时提及使用方法、规范性要求、机器校验和历史交付证据
- **THEN** 文档明确标注各自权威位置，并以链接引用而不是重复定义长期规格或机器合同
