## Purpose

定义一个 Workflow System 如何在同一个 Spec 仓中承载多套 workflow profile，并让每个具体 Change 选择一套固定 profile 执行。该能力把通用工作流能力与具体交付流程分开，使 `delivery-change` 保持重型交付 profile，同时允许未来按真实需求增加其他 profile。

## Requirements

### Requirement: Workflow System SHALL expose multiple stable workflow profiles

Workflow System SHALL 能在同一个 Spec 仓中识别多个独立的 workflow profile。每个 profile SHALL 具有稳定的 `profileId`、可比较的版本标识、阶段定义以及该 profile 所需的输入、输出、退出条件和人工判断合同。不同 profile 的定义、状态和结果 SHALL 不得因共享 core 而混淆。

#### Scenario: 同仓识别多个 profile

- **WHEN** Workflow System 收到包含两个不同 `profileId` 的合法 profile 定义或注册数据
- **THEN** 系统 SHALL 分别返回两个 profile 的稳定身份、版本和阶段合同，且一个 profile 的阶段集合不得出现在另一个 profile 的结果中

#### Scenario: profile 身份重复

- **WHEN** 同一版本范围内提交两个相同 `profileId` 和版本但合同内容不同的 profile
- **THEN** 系统 SHALL 拒绝该冲突，不得静默覆盖先前 profile

### Requirement: A Change SHALL bind one workflow profile explicitly

每个进入 Workflow System 执行的 Change SHALL 显式携带一个 `profileId` 和 `profileVersion`。系统 SHALL 使用该绑定解析 Change 的阶段合同；缺少绑定、绑定不存在或绑定不完整时 SHALL 拒绝执行，不得根据目录、事项标题或未声明上下文猜测 profile。

#### Scenario: Change 选择 delivery profile

- **WHEN** Change 提交合法的 `profileId=delivery-change` 和固定版本
- **THEN** 系统 SHALL 使用该 profile 的阶段和门禁合同，并在执行结果中回显相同的 profile 身份与版本

#### Scenario: Change 选择另一个 profile

- **WHEN** 另一个 Change 提交合法的第二个 profile 绑定
- **THEN** 系统 SHALL 根据第二个 profile 执行，不得套用 `delivery-change` 的阶段、artifact 或门禁

#### Scenario: Change 未选择 profile

- **WHEN** Change 缺少 `profileId` 或 `profileVersion`，或请求的 profile 不存在
- **THEN** 系统 SHALL 返回显式拒绝结果，并 SHALL NOT 自动选择默认 profile

### Requirement: A running Change SHALL retain its selected profile version

Change 一旦开始执行，Workflow System SHALL 保留其已选择的 `profileId` 和 `profileVersion`。profile 新版本发布时，正在执行的 Change SHALL 继续使用原版本，除非发生显式、可审计的迁移；系统 SHALL NOT 静默切换运行中 Change 的流程语义。

#### Scenario: 新版本发布不影响运行中 Change

- **WHEN** Change 已绑定 `profile-a@1` 且 Workflow System 后续提供 `profile-a@2`
- **THEN** 该 Change 的下一次阶段执行 SHALL 仍解析 `profile-a@1`，结果 SHALL 回显原绑定

#### Scenario: 不存在已绑定版本

- **WHEN** Change 绑定的 profile 版本不可解析
- **THEN** 系统 SHALL 返回阻塞或拒绝结果并说明版本缺失，不得降级到其他版本或默认 profile

### Requirement: Workflow profile execution SHALL be independently callable

Workflow System SHALL 支持调用方在没有全局索引或其他仓库扫描的情况下，使用显式 Change 上下文和 profile 绑定独立执行。系统 SHALL 返回机器可读的阶段状态、下一步和产物入口；系统 SHALL NOT 读取或写入调用方未授权的外部资产，也 SHALL NOT 修改调用方仓库内容来完成 profile 选择或状态返回。

#### Scenario: 项目仓直接调用 profile

- **WHEN** 项目仓通过显式请求调用已绑定 profile，且运行环境没有外部索引配置
- **THEN** Workflow System SHALL 根据请求返回机器可读结果，调用方仓库和未授权外部资产 SHALL 保持不变

#### Scenario: profile 执行阻塞

- **WHEN** 当前 profile 阶段缺少必需输入或人工判断
- **THEN** 结果 SHALL 标记为 `blocked` 或 `waiting_human_judgment`，包含稳定原因和当前 profile 绑定，且 SHALL NOT 标记为成功完成

### Requirement: Existing delivery-change SHALL remain compatible as a profile

引入多 profile 能力 SHALL 保留现有 `delivery-change` 的命令、artifact、锁、fail-closed 约束、版本 pin 和消费方式。新 profile core 或 profile selection SHALL NOT 要求现有 delivery-change Change 复制私人业务材料、改写已有状态，或依赖外部工作台才能运行。

#### Scenario: 既有 delivery-change 继续执行

- **WHEN** 现有 delivery-change 消费仓按原命令执行 runtime-check、生命周期和合同测试
- **THEN** 原有行为 SHALL 继续通过，且不存在由多 profile 新入口引起的 submodule dirty、manifest 漂移或额外 lock/hash 文件

#### Scenario: 多 profile 能力失败时保持旧入口

- **WHEN** 新 profile selection 或 core 实现失败
- **THEN** 现有 `delivery-change` 入口 SHALL 仍可独立运行，系统 SHALL NOT 通过修改旧合同或放宽旧 fail-closed 检查来掩盖失败

### Requirement: Workflow profiles SHALL expose executable human-readable metadata

每个注册的 profile SHALL 在同一版本化文件中声明用途、适用范围、不适用范围、阶段说明、阶段退出条件和交接动作。Runtime SHALL 提供机器 `list-profiles`、人类 `catalog` 和精确 `describe` 输出；catalog/describe SHALL 直接读取 registry 与 profile 真源。

#### Scenario: 查看 profile catalog

- **WHEN** 调用方执行 `workflow catalog`
- **THEN** Runtime SHALL 按 registry 顺序输出所有 profile 的身份、用途、阶段流程、退出条件和交接动作

#### Scenario: 查看精确 profile

- **WHEN** 调用方执行 `workflow describe` 并提供 `profileId` 与 `profileVersion`
- **THEN** Runtime SHALL 只输出该精确版本；未知身份或版本 SHALL fail closed

### Requirement: Requirement analysis SHALL enforce report and round contracts

`requirement-analysis` SHALL 对问题框架、能力核验、方案比较、决策报告、处置和 `analysisRounds` 执行声明式结构检查。`analysisRounds` SHALL 保留调用方累积的轮次记录；Runtime SHALL 检查结构并回显输入，不判断事实真伪或替调用方持久化历史。

#### Scenario: 合法分析链推进

- **WHEN** 调用方提交结构完整的报告、合法处置和至少一项完整轮次记录
- **THEN** Runtime SHALL 按阶段推进并在 `outputs.publishedInputs` 返回这些输入

#### Scenario: 结构不完整时拒绝

- **WHEN** 报告缺少必需字段、处置不在允许枚举内或轮次记录不完整
- **THEN** 当前执行结果 SHALL 为 `rejected`，不得仅因输入键存在而推进
