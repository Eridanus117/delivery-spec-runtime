## Purpose

让 Workflow System 的 Profile 目录既能被机器查询，也能被人理解；同时把需求分析 Profile 的关键报告和轮次记录从“只要键存在”提升为可检查的最小内容合同。

## ADDED Requirements

### Requirement: Runtime SHALL expose a human-readable profile catalog

Runtime SHALL 从同一份 registry/profile 真源生成 catalog 和单 Profile describe 输出。输出 SHALL 包含 Profile 身份、用途、适用范围、不适用范围、阶段顺序、每阶段输入、退出条件、人工判断和后续交接；不得维护一份可能漂移的独立手写阶段清单。

#### Scenario: 查看全部 Profile

- **WHEN** 调用方执行 `workflow catalog`
- **THEN** Runtime SHALL 输出 registry 中所有 Profile 的稳定身份、版本、用途和完整阶段流程，且顺序与 registry 一致

#### Scenario: 查看单个 Profile

- **WHEN** 调用方执行 `workflow describe --profile-id requirement-analysis --profile-version v1.0.0`
- **THEN** Runtime SHALL 只输出该精确 Profile 的完整说明；身份或版本不存在时 SHALL fail closed

### Requirement: Profile metadata SHALL remain bound to executable stages

Profile 的用途、适用范围、交接说明和阶段描述 SHALL 与实际执行合同位于同一个版本化 Profile 文件中。catalog/describe SHALL 直接读取该文件，不能从文档或 Desk 推断阶段。

#### Scenario: Profile 文件与 registry 身份不一致

- **WHEN** catalog 或 describe 加载的 Profile 身份、版本与 registry 条目不一致
- **THEN** Runtime SHALL 拒绝输出并说明身份不一致

### Requirement: Requirement analysis SHALL validate report shape and analysis history

`requirement-analysis` 请求 SHALL 为问题框架、能力核验、方案比较和决策报告提供最小结构；分析轮次 SHALL 以可追加的 `analysisRounds` 保存阶段、轮次、已知、未知、证据、置信度和人工判断。缺少结构字段、轮次非法或报告内容类型不符时 SHALL 返回拒绝结果，不得仅因顶层输入键存在而推进。

#### Scenario: 分析报告满足最小结构

- **WHEN** 调用方提交合法 `problemFrame`、`capabilityReport`、`optionReport`、`decisionReport`、`disposition` 和累计 `analysisRounds`
- **THEN** Runtime SHALL 按阶段推进，并在结果中回显可审计的已发布输入和分析轮次

#### Scenario: 报告只有占位字符串

- **WHEN** 必需报告键存在但不是符合合同的对象，或缺少必需字段
- **THEN** 当前阶段 SHALL 返回 `rejected`，并说明具体结构缺口

#### Scenario: 分析轮次继续追加

- **WHEN** 当前分析阶段提交新的 `analysisRounds`，且人工判断为 `continue-analysis`
- **THEN** Runtime SHALL 返回 `in_progress`，保留此前轮次和当前轮次的完整输入，不得自行宣布 `sufficient`

### Requirement: Decision outputs SHALL use explicit disposition values

需求分析决策 SHALL 只接受 `build`、`use-existing`、`defer` 或 `reject`。`build` 可以携带候选 Profile 身份，但 Runtime SHALL 只返回交接建议，不自动绑定、创建 Change 或读取 Desk。

#### Scenario: 非法处置

- **WHEN** `disposition` 不属于四种允许值
- **THEN** Runtime SHALL 返回 `rejected`，不得输出 completed

### Requirement: Existing workflow behavior SHALL remain compatible

新增 catalog 和内容合同 SHALL 不改变既有 Profile 的 registry 顺序、binding、版本固定、阶段越序拒绝和状态语义。除需求分析 Profile 明确新增的结构要求外，既有 `delivery-change` 和 `light-change` 合法请求 SHALL 继续通过。

#### Scenario: 既有轻量与交付请求继续执行

- **WHEN** 调用方使用既有 `delivery-change` 或 `light-change` 绑定提交原本合法的请求
- **THEN** Runtime SHALL 保持原有状态、阶段顺序和 fail-closed 绑定语义，不要求这些 Profile 提交需求分析专用输入
