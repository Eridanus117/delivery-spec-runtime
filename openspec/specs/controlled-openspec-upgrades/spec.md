# controlled-openspec-upgrades Specification

## Purpose

为 `delivery-spec-runtime` 提供隔离、确定性、机器可审计的 OpenSpec 升级评估与交付能力，同时保证真实 Runtime checkout 和消费仓零写入。

## Requirements

### Requirement: 升级生成必须与实时仓隔离

升级评估器 MUST 接收显式 current/candidate 版本和输出目录，在 OS 临时目录分别初始化并生成两套 OMP 资产。评估器 MUST NOT 以 Runtime checkout、真实消费仓或它们的软链路径作为官方 OpenSpec 生成器 cwd。

#### Scenario: 生成 current 与 candidate

- **WHEN** 维护者提交合法的升级评估请求
- **THEN** 评估器在两个独立临时根生成 current 与 candidate 的九个 OMP Commands
- **AND** 请求指定的证据目录只接收脱敏机器报告和允许的生成快照
- **AND** Runtime checkout 与真实消费仓摘要和 Git 状态不变

#### Scenario: 请求路径越界或版本非法

- **WHEN** 请求包含相对逃逸、真实仓输出路径冲突、非精确 SemVer 或 shell command 字符串
- **THEN** 评估器在启动任何包或生成器前非零拒绝

### Requirement: Commands 必须使用唯一的结构化真源

九个 Runtime Commands MUST 由版本化 manifest、公共 Runtime preamble 和九个命令 body fragment 确定性渲染。`.omp/commands/opsx-*.md` MUST 作为渲染物提交，但 MUST NOT 成为可独立编辑的第二真源。

#### Scenario: 渲染与检查

- **WHEN** 执行 renderer 的 write 模式
- **THEN** 它以稳定顺序和稳定换行生成九个 Commands
- **AND** check 模式对同一真源返回成功

#### Scenario: 渲染物漂移

- **WHEN** 任一 rendered Command 被手工修改、缺失或多出
- **THEN** check 模式非零退出并报告具体路径

### Requirement: 升级差异必须机器可审计

评估报告 MUST 同时保存 upstream delta、current-local delta 和 candidate-local delta；每个文件 MUST 记录来源版本、相对路径、SHA-256、变化类型和结构化差异统计。

#### Scenario: 1.10.0 与 1.11.0 候选比较

- **WHEN** 评估 `1.10.0 → 1.11.0`
- **THEN** upstream delta 明确列出文件集合和变化文件
- **AND** current-local 说明 Runtime 当前定制相对 1.10 上游的差异
- **AND** candidate-local 说明吸收 1.11 规则后的 Runtime 候选相对 1.11 上游的差异
- **AND** 报告能区分新增、删除、修改和未变文件

### Requirement: CLI JSON 合同必须跨版本验证

Runtime MUST 以机器 JSON 声明长期依赖的 OpenSpec CLI probes、argv、期望退出码和 required fields。评估器 MUST 对 current 与 candidate 执行相同 probes，并拒绝缺字段、类型不符、非 JSON 输出或退出码漂移。

#### Scenario: delivery-change status 合同兼容

- **WHEN** current 与 candidate 对同一最小 `delivery-change` fixture 执行 `status --change --json`
- **THEN** 两者均满足声明的 required fields 和字段类型
- **AND** 报告保存结构签名而不保存业务正文

### Requirement: 消费仓 smoke 不得写入真实仓

评估器 MUST 接收显式 `name=path` 消费仓清单，将每个仓复制为隔离 Git fixture，注入候选 Runtime 与候选 OpenSpec CLI 后执行声明的 smoke。真实消费仓 MUST 只做前后摘要和 Git 状态核验，不得执行候选生成或生命周期写入。

#### Scenario: 三消费仓隔离 smoke

- **WHEN** 请求包含 `agent-system`、`webcoding-spec` 和 `work-spec`
- **THEN** 每个消费仓只在临时副本执行候选 `runtime-check` 和 JSON probes
- **AND** 报告只保存仓名、版本、退出状态、合同字段与摘要
- **AND** 不保存 Change 正文、长期 spec 正文、环境值或凭据
- **AND** 三个真实仓前后 Git 状态和受管路径摘要不变

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

### Requirement: 候选提升必须通过完整门禁

`runtime-manifest.json` 的 OpenSpec pin 和 Runtime fragments 只有在 renderer check、upstream/local delta、CLI JSON probes、空白 fixture、Runtime 完整合同和三消费仓隔离 smoke 全部通过时 MAY 提升。任一门禁失败时 MUST 保持当前 pin 并保存失败报告。

#### Scenario: 1.11.0 全部门禁通过

- **WHEN** `1.10.0 → 1.11.0` 的全部门禁通过
- **THEN** Runtime 吸收 1.11 `opsx-explore` 的写入确认和配置文件写入范围规则，并将上游 plain ASCII 偏好适配为 OMP 原生 Mermaid；仅在目标表面不能渲染 Mermaid 时降级为简洁 ASCII
- **AND** manifest pin 更新为 `1.11.0`
- **AND** 公共候选 allowlist 包含 renderer、评估器、fragments 和机器合同

#### Scenario: 任一门禁失败

- **WHEN** 任一生成、delta、probe、合同测试或消费仓 smoke 失败
- **THEN** manifest pin 保持 `1.10.0`
- **AND** Change 验收不得填写 PASS
